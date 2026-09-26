import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiSpaRepository } from "../ApiSpaRepository";

describe("ApiSpaRepository", () => {
  it("normalizes the board, keeping each session's bill and card", async () => {
    const get = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          id: "room-1",
          tenantId: "tenant-1",
          locationId: "location-1",
          roomNumber: "SUITE1",
          name: "Couple suite",
          capacity: 2,
          rateVariantId: "variant-1",
          minimumMinutes: 90,
          incrementMinutes: 90,
          graceMinutes: 15,
          roundingMode: "DOWN",
          status: "OCCUPIED",
          sessions: [
            {
              id: "session-1",
              openedAt: "2026-09-26T07:00:00Z",
              guestCount: 2,
              sessionState: "OPEN",
              guestWalletId: "wallet-1",
              salesOrderId: "order-1",
              plannedMinutes: 90,
              endsAt: "2026-09-26T08:30:00Z",
              therapists: [],
            },
          ],
        },
      ],
    });
    const repository = new ApiSpaRepository({ get } as unknown as HttpClient);

    const rooms = await repository.getBoard("location-1");

    expect(get).toHaveBeenCalledWith("/api/v1/spa-rooms/board", {
      params: { locationId: "location-1" },
    });
    expect(rooms[0]).toMatchObject({
      id: "room-1",
      roomNumber: "SUITE1",
      minimumMinutes: 90,
      sessions: [
        {
          id: "session-1",
          roomId: "room-1",
          guestWalletId: "wallet-1",
          salesOrderId: "order-1",
          plannedMinutes: 90,
        },
      ],
    });
  });

  it("sends the open contract and reads a per-treatment quote", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: "session-1", roomId: "room-1", salesOrderId: "order-1", sessionState: "OPEN" },
      })
      .mockResolvedValueOnce({
        data: {
          sessionId: "session-1",
          roomId: "room-1",
          roomNumber: "SUITE1",
          state: "CLOSED",
          segments: [
            { label: "Standard", minutes: 92, billableMinutes: 90, hours: "1.5000", treatments: "1.0000", rate: "45000.0000", amount: "45000.0000" },
          ],
          treatmentCharge: "45000.0000",
          servicesCharge: "8000.0000",
          runningTotal: "53000.0000",
        },
      });
    const repository = new ApiSpaRepository({ post } as unknown as HttpClient);

    const session = await repository.openSession({
      roomId: "room-1",
      guestWalletId: "wallet-1",
      guestCount: 2,
      plannedMinutes: 90,
      salesChannel: "POS",
    });
    const quote = await repository.closeSession("session-1", {});

    expect(post).toHaveBeenNthCalledWith(1, "/api/v1/spa-sessions", {
      roomId: "room-1",
      guestWalletId: "wallet-1",
      guestCount: 2,
      plannedMinutes: 90,
      salesChannel: "POS",
    });
    expect(post).toHaveBeenNthCalledWith(2, "/api/v1/spa-sessions/session-1/close", {});
    expect(session.salesOrderId).toBe("order-1");
    expect(quote.segments[0].treatments).toBe("1.0000");
    expect(quote).toMatchObject({
      treatmentCharge: "45000.0000",
      servicesCharge: "8000.0000",
      runningTotal: "53000.0000",
    });
  });
});
