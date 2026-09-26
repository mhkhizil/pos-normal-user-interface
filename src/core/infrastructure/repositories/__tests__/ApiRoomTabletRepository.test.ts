import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiRoomTabletRepository } from "../ApiRoomTabletRepository";

describe("ApiRoomTabletRepository", () => {
  it("sends the card in the body and reads the visit", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        guest: { displayName: "Daw Hla H.", tier: "Black", discountPercent: 15, isPostpaid: true, balance: "-96500.0000" },
        rooms: [
          {
            sessionId: "session-1",
            roomNumber: "S2",
            sessionMinutes: 60,
            sessionPrice: "30000.0000",
            prepaid: true,
            spent: "51000.0000",
            orders: [
              { id: "o-1", orderNumber: 1, kind: "ITEMS", status: "PREPARING", amount: "10200.0000", items: [{ name: "Ginger tea", quantity: 2 }] },
            ],
          },
        ],
      },
    });
    const repository = new ApiRoomTabletRepository({ post } as unknown as HttpClient);

    const visit = await repository.getVisit("04C9D1E7");

    expect(post).toHaveBeenCalledWith("/api/v1/tablet/visit", { cardUid: "04C9D1E7" });
    expect(visit.guest).toMatchObject({ displayName: "Daw Hla H.", isPostpaid: true });
    expect(visit.rooms[0]).toMatchObject({ roomNumber: "S2", prepaid: true, sessionPrice: "30000.0000" });
    expect(visit.rooms[0].orders[0]).toMatchObject({ status: "PREPARING", items: [{ name: "Ginger tea", quantity: 2, refunded: false }] });
  });

  it("places an order and claims a print", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { charged: "10200.0000", balanceAfter: "89800.0000", orderNumber: 4 } })
      .mockResolvedValueOnce({ data: { claimed: true, order: { id: "ro-1", orderNumber: 4, roomNumber: "S2", items: [] } } });
    const repository = new ApiRoomTabletRepository({ post } as unknown as HttpClient);
    const payload = {
      cardUid: "04C9D1E7",
      sessionId: "session-1",
      items: [{ variantId: "v-1", quantity: 2 }],
      idempotencyKey: "k-1",
      deviceName: "Lounge 1",
    };

    const result = await repository.placeOrder(payload);
    const claim = await repository.claimRoomOrderPrint("ro-1");

    expect(post).toHaveBeenNthCalledWith(1, "/api/v1/tablet/orders", payload);
    expect(post).toHaveBeenNthCalledWith(2, "/api/v1/room-orders/ro-1/claim-print");
    expect(result).toEqual({ charged: "10200.0000", balanceAfter: "89800.0000", orderNumber: 4 });
    expect(claim.claimed).toBe(true);
  });
});
