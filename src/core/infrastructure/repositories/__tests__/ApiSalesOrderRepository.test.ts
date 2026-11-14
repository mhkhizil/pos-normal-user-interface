import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiSalesOrderRepository } from "../ApiSalesOrderRepository";
import type { SalesOrderBillQueryDTO } from "../../../application/dtos/SalesOrderDTO";

describe("ApiSalesOrderRepository", () => {
  it.each<SalesOrderBillQueryDTO>([
    { discount: "12.50", includeTax: false, includeServiceCharge: false },
    { discount: "0", includeTax: false, includeServiceCharge: true },
    { includeTax: true, includeServiceCharge: false },
    { includeTax: true, includeServiceCharge: true },
  ])("forwards bill query unchanged and normalizes preview totals: %j", async (query) => {
    const get = vi.fn().mockResolvedValue({
      success: true,
      data: {
        orderId: "order-1",
        subtotal: "110.0000",
        totalDiscount: "10",
        addedTax: 5,
        totalTax: "15.5000",
        serviceCharge: "10.00",
        serviceChargeTax: 0.5,
        grandTotal: "115.5",
      },
    });
    const repository = new ApiSalesOrderRepository({ get } as unknown as HttpClient);

    const result = await repository.getSalesOrderBill("order-1", query);

    expect(get).toHaveBeenCalledWith("/api/v1/sales-orders/order-1/bill", {
      params: query,
    });
    expect(result).toEqual({
      orderId: "order-1",
      subtotal: "110.0000",
      totalDiscount: "10.0000",
      addedTax: "5.0000",
      totalTax: "15.5000",
      serviceCharge: "10.0000",
      serviceChargeTax: "0.5000",
      grandTotal: "115.5000",
    });
  });

  it("leaves omitted preview flags to backend defaults and supports an unwrapped response", async () => {
    const get = vi.fn().mockResolvedValue({
      orderId: "order-2",
      subtotal: 100,
      totalDiscount: 0,
      addedTax: 0,
      totalTax: 0,
      serviceCharge: 0,
      serviceChargeTax: 0,
      grandTotal: 100,
    });
    const repository = new ApiSalesOrderRepository({ get } as unknown as HttpClient);

    const result = await repository.getSalesOrderBill("order-2");

    expect(get).toHaveBeenCalledWith("/api/v1/sales-orders/order-2/bill", {
      params: undefined,
    });
    expect(result).toMatchObject({
      grandTotal: "100.0000",
      totalDiscount: "0.0000",
      totalTax: "0.0000",
      serviceCharge: "0.0000",
      serviceChargeTax: "0.0000",
    });
  });

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

    // A bill is read whole even when the caller names no page size.
    expect(get).toHaveBeenLastCalledWith("/api/v1/sales-orders/order-1/lines", {
      params: { page: 1, limit: 200 },
    });
    expect(lines.lines[0]).toMatchObject({
      productName: "Tea",
      sku: "TEA-L",
    });
    expect(lines.lines[0].variantName).toBeUndefined();
  });

  it("names a line's variant by its options when no variant name was saved", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          id: "line-1",
          variantId: "variant-1",
          quantity: "1.0000",
          unitPrice: "10.0000",
          product: { name: "Coffee" },
          variant: { matrixOptions: { size: "Large", color: "Black" } },
        },
      ],
    });
    const repository = new ApiSalesOrderRepository({
      get,
    } as unknown as HttpClient);

    const result = await repository.getSalesOrderLines("order-1");

    expect(result.lines[0]).toMatchObject({
      productName: "Coffee",
      variantName: "Large / Black",
    });
  });

  it("uses line quantities and _count when list payloads omit itemCount", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          id: "order-2",
          tenantId: "tenant-1",
          locationId: "location-1",
          orderNumber: "SO-002",
          serviceType: "DINE_IN",
          status: "DRAFT",
          grandTotal: "30.0000",
          itemCount: 0,
          _count: { lines: 2 },
        },
        {
          id: "order-3",
          tenantId: "tenant-1",
          locationId: "location-1",
          orderNumber: "SO-003",
          serviceType: "DINE_IN",
          status: "DRAFT",
          grandTotal: "15.0000",
          lines: [
            { id: "line-a", quantity: "2.0000", unitPrice: "5.0000" },
            { id: "line-b", quantity: "1.0000", unitPrice: "5.0000" },
          ],
        },
      ],
    });
    const repository = new ApiSalesOrderRepository({
      get,
    } as unknown as HttpClient);

    const result = await repository.getSalesOrders({ page: 1, limit: 20 });
    expect(result.orders[0].itemCount).toBe(2);
    expect(result.orders[1].itemCount).toBe(3);
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
      includeTax: false,
      includeServiceCharge: false,
      totalDiscount: "12.5000",
      discountReasonId: "reason-1",
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

  it("sends who ordered a line when it changes", async () => {
    const patch = vi.fn().mockResolvedValue({ data: { id: "line-1" } });
    const repository = new ApiSalesOrderRepository({ patch } as unknown as HttpClient);

    await repository.updateSalesOrderLine("order-1", "line-1", { hostessId: "hostess-1" });
    await repository.updateSalesOrderLine("order-1", "line-1", { hostessId: null });

    expect(patch.mock.calls.map(([, body]) => body)).toEqual([
      { hostessId: "hostess-1" },
      { hostessId: null },
    ]);
  });
});
