import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiKtvRepository } from "../ApiKtvRepository";

describe("ApiKtvRepository", () => {
  it("normalizes the room board and nested sessions", async () => {
    const get = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          id: "room-1",
          tenantId: "tenant-1",
          locationId: "location-1",
          roomNumber: "A1",
          name: "Grand Room",
          capacity: 12,
          rateVariantId: "variant-1",
          minimumMinutes: 60,
          incrementMinutes: 30,
          graceMinutes: 5,
          roundingMode: "UP",
          status: "IN_USE",
          sessions: [
            {
              id: "session-1",
              openedAt: "2026-09-21T12:00:00Z",
              guestCount: 5,
              sessionState: "OPEN",
              guestWalletId: "wallet-1",
              plannedMinutes: 180,
              endsAt: "2026-09-21T15:00:00Z",
            },
          ],
        },
      ],
    });
    const repository = new ApiKtvRepository({
      get,
    } as unknown as HttpClient);

    const rooms = await repository.getBoard();

    expect(get).toHaveBeenCalledWith("/api/v1/ktv-rooms/board");
    expect(rooms[0]).toMatchObject({
      id: "room-1",
      roomNumber: "A1",
      sessions: [
        {
          id: "session-1",
          roomId: "room-1",
          guestWalletId: "wallet-1",
          plannedMinutes: 180,
        },
      ],
    });
  });

  it("sends exact open and close session contracts", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: "session-1",
          roomId: "room-1",
          guestCount: 2,
          openedAt: "2026-09-21T12:00:00Z",
          salesOrderId: "order-1",
          sessionState: "OPEN",
        },
      })
      .mockResolvedValueOnce({
        data: {
          sessionId: "session-1",
          roomId: "room-1",
          roomNumber: "A1",
          state: "CLOSED",
          openedAt: "2026-09-21T12:00:00Z",
          asOf: "2026-09-21T13:00:00Z",
          elapsedMinutes: 60,
          pausedMinutes: 0,
          segments: [],
          roomCharge: "100.0000",
          fnbCharge: "20.0000",
          runningTotal: "120.0000",
        },
      });
    const repository = new ApiKtvRepository({
      post,
    } as unknown as HttpClient);

    await repository.openSession({
      roomId: "room-1",
      guestCount: 2,
      guestWalletId: "wallet-1",
      hostUserId: "user-1",
      posRegisterId: "register-1",
      openedByPosSessionId: "pos-session-1",
      salesChannel: "POS",
    });
    await repository.closeSession("session-1", {
      closedAt: "2026-09-21T13:00:00Z",
    });

    expect(post).toHaveBeenNthCalledWith(1, "/api/v1/ktv-sessions", {
      roomId: "room-1",
      guestCount: 2,
      guestWalletId: "wallet-1",
      hostUserId: "user-1",
      posRegisterId: "register-1",
      openedByPosSessionId: "pos-session-1",
      salesChannel: "POS",
    });
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/api/v1/ktv-sessions/session-1/close",
      { closedAt: "2026-09-21T13:00:00Z" }
    );
  });

  it("maps the room tablet menu and session read models", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          roomNumber: "VIP1",
          categories: [
            {
              categoryId: "category-1",
              name: "KTV Snacks",
              items: [
                {
                  variantId: "variant-1",
                  name: "Myanmar Beer",
                  price: "3500.0000",
                  imageUrl: "/uploads/beer.png",
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          roomNumber: "VIP1",
          guestCount: 6,
          openedAt: "2026-09-22T20:00:00.000Z",
          endsAt: "2026-09-22T23:00:00.000Z",
          sessionState: "OPEN",
          lines: [
            {
              name: "Myanmar Beer",
              quantity: "6.0000",
              unitPrice: "3500.0000",
              lineTotal: "21000.0000",
              status: "PENDING",
            },
          ],
          fnbTotal: "21000.0000",
          walletBalance: "150000.0000",
        },
      });
    const repository = new ApiKtvRepository({
      get,
    } as unknown as HttpClient);

    const menu = await repository.getRoomTabletMenu();
    const session = await repository.getRoomTabletSession();

    expect(get).toHaveBeenNthCalledWith(1, "/api/v1/room-tablet/menu");
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/room-tablet/session");
    expect(menu.categories[0].items[0]).toMatchObject({
      variantId: "variant-1",
      price: "3500.0000",
    });
    expect(session).toMatchObject({
      roomNumber: "VIP1",
      endsAt: "2026-09-22T23:00:00.000Z",
      fnbTotal: "21000.0000",
      walletBalance: "150000.0000",
      lines: [{ name: "Myanmar Beer", quantity: "6.0000" }],
    });
  });

  it("reads each room menu item's options and the shop's quick notes", async () => {
    const get = vi.fn().mockResolvedValueOnce({
      data: {
        roomNumber: "VIP1",
        quickNotes: ["No ice", "Less sugar"],
        categories: [
          {
            categoryId: "c1",
            name: "Drinks",
            items: [
              {
                variantId: "variant-1",
                productId: "product-1",
                name: "Myanmar Beer",
                price: "3500.0000",
                modifierGroups: [
                  {
                    id: "ice",
                    name: "Ice",
                    minSelection: 0,
                    maxSelection: 1,
                    isRequired: false,
                    modifiers: [{ id: "extra", name: "Extra ice", priceDelta: "500.0000", isDefault: false }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const repository = new ApiKtvRepository({ get } as unknown as HttpClient);

    const menu = await repository.getRoomTabletMenu();

    expect(menu.quickNotes).toEqual(["No ice", "Less sugar"]);
    expect(menu.categories[0].items[0]).toMatchObject({
      productId: "product-1",
      modifierGroups: [
        {
          id: "ice",
          maxSelection: 1,
          modifiers: [{ id: "extra", name: "Extra ice", priceDelta: "500.0000", isDefault: false }],
        },
      ],
    });
  });
});
