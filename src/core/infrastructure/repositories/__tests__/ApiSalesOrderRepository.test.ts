import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiSalesOrderRepository } from "../ApiSalesOrderRepository";

describe("ApiSalesOrderRepository", () => {
  it("maps customer names, item summaries, and product labels from nested payloads", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          id: "order-1",
          tenantId: "tenant-1",
          locationId: "location-1",
          orderNumber: "SO-001",
          serviceType: "COUNTER",
          status: "DRAFT",
          grandTotal: "0.0000",
          customer: { fullName: "Jane Doe" },
          lines: [
            {
              id: "line-1",
              variantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
              quantity: "1.0000",
              unitPrice: "10.0000",
              product: { name: "Coffee" },
            },
          ],
        },
      ],
    });
    const repository = new ApiSalesOrderRepository({
      get,
    } as unknown as HttpClient);

    const result = await repository.getSalesOrders({ page: 1, limit: 20 });
    expect(result.orders[0]).toMatchObject({
      customerName: "Jane Doe",
      itemCount: 1,
      itemSummary: "Coffee",
      serviceType: "PICK_UP",
    });

    get.mockResolvedValueOnce({
      data: [
        {
          id: "line-1",
          variantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: "2.0000",
          unitPrice: "5.0000",
          product: { name: "Tea" },
          variant: { variantSku: "TEA-L" },
        },
      ],
    });
    const lines = await repository.getSalesOrderLines("order-1");
    expect(lines.lines[0]).toMatchObject({
      productName: "Tea",
      sku: "TEA-L",
    });
  });

  it("settles a bill through the settle endpoint and reads the result", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        orderId: "order-1",
        orderNumber: "SO-001",
        grandTotal: "58425.0000",
        totalPaid: "58425.0000",
        change: "0.0000",
        status: "COMPLETED",
      },
    });
    const repository = new ApiSalesOrderRepository({ post } as unknown as HttpClient);
    const payload = {
      payments: [{ paymentMethodId: "card-method", guestCardId: "card-1" }],
      posSessionId: "pos-1",
      idempotencyKey: "spa-settle-session-1",
    };

    const result = await repository.settleSalesOrder("order-1", payload);

    expect(post).toHaveBeenCalledWith("/api/v1/sales-orders/order-1/settle", payload);
    expect(result).toEqual({
      orderId: "order-1",
      orderNumber: "SO-001",
      grandTotal: "58425.0000",
      totalPaid: "58425.0000",
      change: "0.0000",
      status: "COMPLETED",
    });
  });
});
