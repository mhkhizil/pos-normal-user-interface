import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiCashierRepository } from "../ApiCashierRepository";

describe("ApiCashierRepository", () => {
  it.each([[true, true], [false, true], [true, false], [false, false]])(
    "preserves bill options through table and direct checkout (%s, %s)",
    async (includeTax, includeServiceCharge) => {
      const post = vi.fn().mockResolvedValue({ data: { id: "session-1" } });
      const repository = new ApiCashierRepository({ post } as unknown as HttpClient);
      await repository.checkoutTableSession("session-1", {
        posSessionId: "shift-1", payments: [{ paymentMethodId: "cash", amount: "100.0000" }],
        includeTax, includeServiceCharge,
      });
      expect(post).toHaveBeenLastCalledWith("/api/v1/table-sessions/session-1/checkout", expect.objectContaining({
        includeTax, includeServiceCharge,
      }));
      await repository.checkout({
        tenantId: "tenant-1", locationId: "location-1", salesChannel: "POS", serviceType: "DINE_IN",
        items: [{ variantId: "variant-1", quantity: "1.0000" }],
        payments: [{ paymentMethodId: "cash", amount: "100.0000" }], includeTax, includeServiceCharge,
      });
      expect(post).toHaveBeenLastCalledWith("/api/v1/checkout", expect.objectContaining({ includeTax, includeServiceCharge }));
    }
  );

  it("names an order line's item, however the API nests the name", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: "line-1",
            salesOrderId: "order-1",
            variantId: "variant-1",
            quantity: "2.0000",
            unitPrice: "10000.0000",
            status: "FIRED",
            firedAt: "2026-10-23T10:00:00.000Z",
            product: { name: "Fish Ball Stick" },
            variant: { variantSku: "FBS-01" },
          },
          {
            id: "line-2",
            salesOrderId: "order-1",
            variantId: "variant-2",
            quantity: "1.0000",
            unitPrice: "30000.0000",
            name: "Wine",
          },
          {
            id: "line-3",
            salesOrderId: "order-1",
            variantId: "variant-3",
            quantity: "1.0000",
            unitPrice: "8000.0000",
            variant: { variantSku: "LEO-01" },
          },
          {
            id: "line-4",
            salesOrderId: "order-1",
            variantId: "variant-4",
            quantity: "1.0000",
            unitPrice: "9000.0000",
            productName: "3f2a0d1c-7b4e-4c2a-9f11-aaaaaaaaaaaa",
            variant: { variantSku: "GUINNESS-01" },
          },
        ],
      }),
    };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    const lines = await repository.getSalesOrderLines("order-1");

    expect(lines[0]).toMatchObject({
      productName: "Fish Ball Stick",
      sku: "FBS-01",
      status: "FIRED",
      firedAt: "2026-10-23T10:00:00.000Z",
    });
    expect(lines[1].productName).toBe("Wine");
    expect(lines[2].productName).toBeUndefined();
    expect(lines[2].sku).toBe("LEO-01");
    expect(lines[3].productName).toBeUndefined();
    expect(lines[3].sku).toBe("GUINNESS-01");
  });

  it("reads the menu price the server sends with a line", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: "line-1",
            salesOrderId: "order-1",
            variantId: "variant-1",
            quantity: "1.0000",
            unitPrice: "1500.0000",
            variant: { priceModifier: "500.0000", product: { name: "Water", basePrice: "1500.0000" } },
          },
          { id: "line-2", salesOrderId: "order-1", variantId: "variant-2", quantity: "1.0000", unitPrice: "1.0000" },
        ],
      }),
    };
    const repository = new ApiCashierRepository(httpClient as unknown as HttpClient);

    const lines = await repository.getSalesOrderLines("order-1");

    expect(lines[0].menuPrice).toBe("2000");
    expect(lines[1].menuPrice).toBeUndefined();
  });

  it("keeps the category a line was sold under, however the API nests it", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: "line-1",
            salesOrderId: "order-1",
            variantId: "variant-1",
            quantity: "1.0000",
            unitPrice: "10000.0000",
            categoryId: "cat-drinks",
            categoryName: "Drinks",
          },
          {
            id: "line-2",
            salesOrderId: "order-1",
            variantId: "variant-2",
            quantity: "1.0000",
            unitPrice: "8000.0000",
            salesOrderLine: { categoryId: "cat-snacks" },
          },
          {
            id: "line-3",
            salesOrderId: "order-1",
            variantId: "variant-3",
            quantity: "1.0000",
            unitPrice: "9000.0000",
            product: { name: "Ginger tea", category: { id: "cat-tea" } },
          },
        ],
      }),
    };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    const lines = await repository.getSalesOrderLines("order-1");

    expect(lines[0]).toMatchObject({
      categoryId: "cat-drinks",
      categoryName: "Drinks",
    });
    expect(lines[1].categoryId).toBe("cat-snacks");
    expect(lines[2].categoryId).toBe("cat-tea");
  });

  it("keeps modifiers, tax and promotion fields on a reloaded order line", async () => {
    // The till reads these back from a line it already rang up: the order panel
    // merges a plain tap only into lines without modifiers, prints the
    // modifiers on the bill, and copies tax/promotion when a line moves.
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: "line-1",
            salesOrderId: "order-1",
            variantId: "variant-1",
            quantity: "1.0000",
            unitPrice: "10000.0000",
            lineDiscount: "1000.0000",
            taxRateId: "tax-1",
            taxAmount: "900.0000",
            taxInclusive: true,
            appliedPromotionId: "promo-1",
            voidReasonId: "void-1",
            compReasonId: "comp-1",
            courseType: "MAIN",
            selectedModifiers: [
              { modifierId: "mod-1", name: "Oat milk", priceDelta: "1500.0000" },
            ],
            updatedAt: "2026-10-23T10:00:00.000Z",
          },
          {
            id: "line-2",
            salesOrderId: "order-1",
            variantId: "variant-2",
            quantity: "2.0000",
            unitPrice: "5000.0000",
            selectedModifiers: {
              "mod-2": { modifierId: "mod-2", name: "No ice" },
            },
          },
          {
            id: "line-3",
            salesOrderId: "order-1",
            variantId: "variant-3",
            quantity: "1.0000",
            unitPrice: "5000.0000",
            selectedModifiers: [],
          },
        ],
      }),
    };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    const lines = await repository.getSalesOrderLines("order-1");

    expect(lines[0]).toMatchObject({
      taxRateId: "tax-1",
      taxAmount: "900.0000",
      taxInclusive: true,
      appliedPromotionId: "promo-1",
      voidReasonId: "void-1",
      compReasonId: "comp-1",
      courseType: "MAIN",
      updatedAt: "2026-10-23T10:00:00.000Z",
    });
    expect(lines[0].selectedModifiers).toEqual([
      { modifierId: "mod-1", name: "Oat milk", priceDelta: "1500.0000" },
    ]);
    expect(lines[1].selectedModifiers).toEqual({
      "mod-2": { modifierId: "mod-2", name: "No ice" },
    });
    expect(lines[2].selectedModifiers).toBeUndefined();
  });

  it("normalizes nested paginated list responses", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: {
          page: 1,
          total: 1,
          items: [
            {
              id: "product-1",
              tenantId: "tenant-1",
              categoryId: "cat-drinks",
              category: { id: "cat-drinks", name: "Drinks" },
              name: "Coffee",
              basePrice: "10.0000",
              baseSku: "COFFEE",
              isAvailable: true,
              isTaxable: true,
              taxRate: {
                id: "tax-1",
                name: "Commercial Tax",
                ratePercentage: "5.0000",
                isPriceInclusive: false,
              },
            },
          ],
        },
      }),
    };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    const products = await repository.getProducts({ page: 1, limit: 20 });

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: "product-1",
      categoryId: "cat-drinks",
      categoryName: "Drinks",
      name: "Coffee",
      basePrice: "10.0000",
      isAvailable: true,
      isTaxable: true,
      taxRate: 5,
      isPriceInclusive: false,
    });
  });

  it("normalizes waitlist, tip-pool allocation, and counter-order envelopes", async () => {
    const httpClient = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            data: {
              waitlist: [
                {
                  id: "wait-1",
                  guestName: "John",
                  guestPhone: "555",
                  partySize: 2,
                  status: "WAITING",
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            allocations: [
              {
                id: "allocation-1",
                tipPoolId: "pool-1",
                userId: "user-1",
                role: "SERVER",
                amount: "25.0000",
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            id: "counter-1",
            serviceType: "DINE_IN",
            salesOrderLines: [{ id: "line-1", quantity: "2.0000" }],
            orderPayments: [{ id: "payment-1", amount: "100.0000" }],
            kdsTickets: [
              {
                id: "ticket-1",
                kdsTicketLines: [
                  { id: "ticket-line-1", productName: "Cheeseburger" },
                ],
              },
            ],
          },
        }),
    };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    const waitlist = await repository.getWaitlist();
    const allocations = await repository.getTipPoolAllocations("pool-1");
    const counterOrder = await repository.getCounterOrderById("counter-1");

    expect(waitlist[0]).toMatchObject({
      id: "wait-1",
      guestName: "John",
      status: "WAITING",
    });
    expect(allocations[0]).toMatchObject({
      id: "allocation-1",
      userId: "user-1",
      amount: "25.0000",
    });
    expect(counterOrder).toMatchObject({
      id: "counter-1",
      salesOrderLines: [{ id: "line-1" }],
      orderPayments: [{ id: "payment-1" }],
      kdsTickets: [{ id: "ticket-1" }],
    });
  });

  it("sends numeric line fields for table session lines", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: "line-1",
        salesOrderId: "order-1",
        variantId: "variant-1",
        quantity: 1,
        unitPrice: 10,
      },
    });
    const httpClient = { post };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    await repository.addTableSessionLine("session-1", {
      variantId: "variant-1",
      quantity: "1.0000",
      unitPrice: "10.0000",
      lineDiscount: "0.0000",
    });

    expect(post).toHaveBeenCalledWith(
      "/api/v1/table-sessions/session-1/lines",
      {
        variantId: "variant-1",
        quantity: 1,
        unitPrice: 10,
        lineDiscount: 0,
      }
    );
  });

  it("supports pickup responses with and without an order body", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: "counter-1",
          serviceType: "TAKEAWAY",
          status: "COMPLETED",
          pickedUpAt: "2026-09-22T20:00:00.000Z",
        },
      })
      .mockResolvedValueOnce(undefined);
    const repository = new ApiCashierRepository({
      post,
    } as unknown as HttpClient);

    const pickedUp = await repository.pickupCounterOrder("counter-1");
    const noContent = await repository.pickupCounterOrder("counter-2");

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/api/v1/counter-orders/counter-1/pickup"
    );
    expect(pickedUp).toMatchObject({
      id: "counter-1",
      status: "COMPLETED",
      pickedUpAt: "2026-09-22T20:00:00.000Z",
    });
    expect(noContent).toBeNull();
  });

  it("sends decimal strings for sales order lines", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: "line-1",
        salesOrderId: "order-2",
        variantId: "variant-1",
        quantity: "1.0000",
        unitPrice: "10.0000",
      },
    });
    const httpClient = { post };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    await repository.addSalesOrderLine("order-2", {
      variantId: "variant-1",
      quantity: "1.0000",
      unitPrice: "10.0000",
      lineDiscount: "0.0000",
    });

    expect(post).toHaveBeenCalledWith(
      "/api/v1/sales-orders/order-2/lines",
      {
        variantId: "variant-1",
        quantity: "1.0000",
        unitPrice: "10.0000",
        lineDiscount: "0.0000",
      }
    );
  });

  it("sends numeric payment amounts for table session checkout", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: "session-1",
        sessionState: "CLOSED",
      },
    });
    const httpClient = { post };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    await repository.checkoutTableSession("session-1", {
      posSessionId: "pos-session-current",
      payments: [{ paymentMethodId: "cash", amount: "10.5000" }],
    });

    expect(post).toHaveBeenCalledWith(
      "/api/v1/table-sessions/session-1/checkout",
      {
        posSessionId: "pos-session-current",
        payments: [{ paymentMethodId: "cash", amount: 10.5 }],
      }
    );
  });

  it("sends decimal strings for direct checkout", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      data: { id: "checkout-1" },
    });
    const httpClient = { post };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    await repository.checkout({
      tenantId: "tenant-1",
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      items: [
        {
          variantId: "variant-1",
          quantity: "1.0000",
          lineDiscount: "0.0000",
        },
      ],
      payments: [{ paymentMethodId: "cash", amount: "10.5000" }],
    });

    expect(post).toHaveBeenCalledWith("/api/v1/checkout", {
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      items: [
        {
          variantId: "variant-1",
          quantity: "1.0000",
          lineDiscount: "0.0000",
        },
      ],
      payments: [{ paymentMethodId: "cash", amount: "10.5000" }],
    });
  });

  it("sends each quick-sale item's options, hostess, note and fee price", async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: {} });
    const repository = new ApiCashierRepository({ post } as unknown as HttpClient);

    await repository.checkout({
      tenantId: "tenant-1",
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      items: [
        {
          variantId: "variant-rice",
          quantity: "1",
          lineDiscount: "0",
          selectedModifiers: [{ modifierId: "mod-egg" }],
          hostessId: "hostess-snow",
          note: "No onion",
        },
        { variantId: "variant-fee", quantity: "1", unitPrice: "500", name: "Box" },
      ],
      payments: [{ paymentMethodId: "cash", amount: "9000" }],
    });

    const [, body] = post.mock.calls[0] as [string, { items: unknown[] }];
    expect(body.items).toEqual([
      {
        variantId: "variant-rice",
        quantity: "1.0000",
        lineDiscount: "0.0000",
        selectedModifiers: [{ modifierId: "mod-egg" }],
        hostessId: "hostess-snow",
        note: "No onion",
      },
      {
        variantId: "variant-fee",
        quantity: "1.0000",
        lineDiscount: "0.0000",
        unitPrice: "500.0000",
        name: "Box",
      },
    ]);
  });

  it("sends checkout tip, service charge, and discount reason", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      data: { orderId: "checkout-1" },
    });
    const repository = new ApiCashierRepository({
      post,
    } as unknown as HttpClient);

    await repository.checkout({
      tenantId: "tenant-1",
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      tipAmount: "5.0000",
      serviceCharge: "3.0000",
      discountReasonId: "reason-1",
      items: [
        {
          variantId: "variant-1",
          quantity: "1.0000",
          lineDiscount: "5.0000",
        },
      ],
      payments: [
        {
          paymentMethodId: "cash",
          amount: "93.0000",
          tipAmount: "5.0000",
        },
      ],
    });

    expect(post).toHaveBeenCalledWith("/api/v1/checkout", {
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      discountReasonId: "reason-1",
      tipAmount: "5.0000",
      serviceCharge: "3.0000",
      items: [
        {
          variantId: "variant-1",
          quantity: "1.0000",
          lineDiscount: "5.0000",
        },
      ],
      payments: [
        {
          paymentMethodId: "cash",
          amount: "93.0000",
          tipAmount: "5.0000",
        },
      ],
    });
  });

  it("sends guestCardId on member-card checkout payments", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      data: { id: "checkout-1" },
    });
    const httpClient = { post };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    await repository.checkout({
      tenantId: "tenant-1",
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      items: [
        {
          variantId: "variant-1",
          quantity: "1.0000",
          lineDiscount: "0.0000",
        },
      ],
      payments: [
        {
          paymentMethodId: "cash",
          amount: "4.0000",
        },
        {
          paymentMethodId: "member",
          amount: "6.5000",
          guestCardId: "card-1",
        },
      ],
    });

    expect(post).toHaveBeenCalledWith("/api/v1/checkout", {
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "DINE_IN",
      items: [
        {
          variantId: "variant-1",
          quantity: "1.0000",
          lineDiscount: "0.0000",
        },
      ],
      payments: [
        { paymentMethodId: "cash", amount: "4.0000" },
        {
          paymentMethodId: "member",
          amount: "6.5000",
          guestCardId: "card-1",
        },
      ],
    });
  });

  it("maps payment-methods list from kind/isActive/glAccountId", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        message: "Request successful",
        meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
        data: [
          {
            id: "pm-cash",
            tenantId: "tenant-1",
            name: "Cash",
            kind: "CASH",
            isActive: true,
            glAccountId: "gl-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "pm-card",
            tenantId: "tenant-1",
            name: "Member Card",
            kind: "MEMBER_CARD",
            isActive: false,
            glAccountId: "gl-2",
          },
        ],
      }),
    };
    const repository = new ApiCashierRepository(
      httpClient as unknown as HttpClient
    );

    const methods = await repository.getPaymentMethods();

    expect(httpClient.get).toHaveBeenCalledWith("/api/v1/payment-methods", {
      params: { page: 1, limit: 100 },
    });
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      id: "pm-cash",
      tenantId: "tenant-1",
      name: "Cash",
      kind: "CASH",
      code: "CASH",
      isActive: true,
      glAccountId: "gl-1",
    });
  });

  it("creates a sales order with its service type", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        id: "order-1",
        tenantId: "tenant-1",
        locationId: "location-1",
        serviceType: "TAKEAWAY",
        status: "DRAFT",
      },
    });
    const repository = new ApiCashierRepository({
      post,
    } as unknown as HttpClient);

    const order = await repository.createSalesOrder({
      tenantId: "tenant-1",
      locationId: "location-1",
      salesChannel: "POS",
      serviceType: "TAKE_AWAY",
      status: "DRAFT",
    });

    expect(post).toHaveBeenCalledWith("/api/v1/sales-orders", {
      tenantId: "tenant-1",
      locationId: "location-1",
      customerId: undefined,
      orderNumber: undefined,
      salesChannel: "POS",
      idempotencyKey: undefined,
      subtotal: undefined,
      totalDiscount: undefined,
      totalTax: undefined,
      grandTotal: undefined,
      status: "DRAFT",
      serviceType: "TAKEAWAY",
    });
    expect(order.serviceType).toBe("TAKE_AWAY");
  });

  it("posts checkout void with only the sale id path", async () => {
    const post = vi.fn().mockResolvedValue({
      success: true,
      message: "Request successful",
      data: {
        orderId: "sale-1",
        orderNumber: "SO-20260402-0001",
        grandTotal: "95.0000",
        totalPaid: "100.0000",
        change: "5.0000",
        status: "COMPLETED",
      },
    });
    const repository = new ApiCashierRepository({
      post,
    } as unknown as HttpClient);

    const result = await repository.voidCheckout("sale-1");

    expect(post).toHaveBeenCalledWith("/api/v1/checkout/sale-1/void", undefined, undefined);
    expect(result).toEqual({
      orderId: "sale-1",
      orderNumber: "SO-20260402-0001",
      grandTotal: "95.0000",
      totalPaid: "100.0000",
      change: "5.0000",
      status: "COMPLETED",
    });
  });
  it("sends the manager's approval with a void", async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: { orderId: "sale-1" } });
    const repository = new ApiCashierRepository({ post } as unknown as HttpClient);

    await repository.voidCheckout("sale-1", "approval-token");

    expect(post).toHaveBeenCalledWith("/api/v1/checkout/sale-1/void", undefined, {
      headers: { "x-approver-authorization": "approval-token" },
    });
  });


  it("lists discount reasons without activeOnly query params", async () => {
    const get = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: "reason-1", code: "STAFF", name: "Staff", isActive: true },
        { id: "reason-2", code: "OLD", name: "Old", isActive: false },
      ],
    });
    const repository = new ApiCashierRepository({
      get,
    } as unknown as HttpClient);

    const reasons = await repository.getDiscountReasons(true);

    expect(get).toHaveBeenCalledWith("/api/v1/discount-reasons", {
      params: { page: 1, limit: 100 },
    });
    expect(reasons.map((reason) => reason.id)).toEqual(["reason-1"]);
  });

  it("maps nested table and order ids on table sessions", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: "session-1",
            tenantId: "tenant-1",
            table: { id: "table-1", tableNumber: "T-01" },
            guestCount: 2,
            openedAt: "2026-09-21T12:00:00.000Z",
            closedAt: null,
            salesOrder: { id: "order-1" },
            sessionState: "ORDERING",
          },
        ],
      },
    });
    const repository = new ApiCashierRepository({
      get,
    } as unknown as HttpClient);

    const sessions = await repository.getTableSessions({ page: 1, limit: 100 });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "session-1",
      tableId: "table-1",
      salesOrderId: "order-1",
      sessionState: "ORDERING",
    });
  });

  it("calls the seating endpoints and reads joined tables back", async () => {
    const session = {
      data: {
        id: "session-1",
        tableId: "table-5",
        salesOrderId: "order-1",
        sessionState: "ORDERING",
        joinedTables: [{ sessionId: "session-1", tableId: "table-6" }],
      },
    };
    const post = vi.fn().mockResolvedValue(session);
    const del = vi.fn().mockResolvedValue(session);
    const repository = new ApiCashierRepository({
      post,
      delete: del,
    } as unknown as HttpClient);

    const moved = await repository.changeTableSeating("session-1", {
      kind: "move",
      tableId: "table-9",
    });
    expect(post).toHaveBeenLastCalledWith("/api/v1/table-sessions/session-1/move", {
      tableId: "table-9",
    });
    expect(moved.joinedTableIds).toEqual(["table-6"]);

    await repository.changeTableSeating("session-1", {
      kind: "merge",
      sourceSessionId: "session-2",
      keepTable: true,
    });
    expect(post).toHaveBeenLastCalledWith("/api/v1/table-sessions/session-1/merge", {
      sourceSessionId: "session-2",
      keepTable: true,
    });

    await repository.changeTableSeating("session-1", {
      kind: "split",
      targetSessionId: "session-3",
      lines: [{ lineId: "line-1", quantity: 2 }],
    });
    expect(post).toHaveBeenLastCalledWith("/api/v1/table-sessions/session-1/split", {
      targetSessionId: "session-3",
      lines: [{ lineId: "line-1", quantity: 2 }],
    });

    await repository.changeTableSeating("session-1", {
      kind: "join",
      tableId: "table-6",
    });
    expect(post).toHaveBeenLastCalledWith("/api/v1/table-sessions/session-1/tables", {
      tableId: "table-6",
    });

    await repository.changeTableSeating("session-1", {
      kind: "release",
      tableId: "table-6",
    });
    expect(del).toHaveBeenCalledWith(
      "/api/v1/table-sessions/session-1/tables/table-6"
    );
  });

  it("keeps table status and closed sessions from being misread", async () => {
    const get = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("dining-tables")) {
        return Promise.resolve({
          data: {
            items: [
              { id: "table-free", tableNumber: "T1", status: "available" },
              { id: "table-busy", tableNumber: "T2", status: " occupied " },
            ],
          },
        });
      }
      return Promise.resolve({
        data: {
          items: [
            {
              id: "session-closed",
              tableId: "table-free",
              openedAt: "2026-09-21T12:00:00.000Z",
              closedAt: "2026-09-21T13:00:00.000Z",
            },
          ],
        },
      });
    });
    const repository = new ApiCashierRepository({
      get,
    } as unknown as HttpClient);

    const tables = await repository.getDiningTables({ page: 1, limit: 200 });
    const sessions = await repository.getTableSessions({ page: 1, limit: 200 });

    expect(tables.map((table) => table.status)).toEqual(["AVAILABLE", "OCCUPIED"]);
    expect(sessions[0]?.sessionState).toBe("CLOSED");
  });

  it("maps an active dining session and posts a new table", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        id: "table-1",
        tenantId: "tenant-1",
        zoneId: "zone-1",
        tableNumber: "T-12",
        maxSeats: 4,
        posX: "120.50",
        posY: "85.00",
        shape: "RECTANGLE",
        status: "AVAILABLE",
        activeSession: {
          id: "session-1",
          salesOrderId: "order-1",
          guestCount: 4,
          sessionState: "SEATED",
          openedAt: "2026-09-19T06:32:00.000Z",
          seatedSeconds: 120,
          itemCount: 3,
        },
      },
    });
    const repository = new ApiCashierRepository({
      post,
    } as unknown as HttpClient);

    const table = await repository.createDiningTable({
      tenantId: "tenant-1",
      zoneId: "zone-1",
      tableNumber: "T-12",
      maxSeats: 4,
      posX: 120.5,
      posY: 85,
      shape: "RECTANGLE",
      status: "AVAILABLE",
    });

    expect(post).toHaveBeenCalledWith("/api/v1/dining-tables", {
      tenantId: "tenant-1",
      zoneId: "zone-1",
      tableNumber: "T-12",
      maxSeats: 4,
      posX: 120.5,
      posY: 85,
      shape: "RECTANGLE",
      status: "AVAILABLE",
    });
    expect(table.activeSession?.itemCount).toBe(3);
    expect(table.activeSession?.guestCount).toBe(4);
  });

  it("lists and reads KDS tickets from the ticket endpoints", async () => {
    const get = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/kds/tickets/ticket-1")) {
        return Promise.resolve({
          success: true,
          data: {
            id: "ticket-1",
            ticketNumber: "KDS-20260506-0001",
            status: "PENDING",
            courseType: "MAIN",
            stationId: "station-1",
            firedAt: "2026-09-22T16:53:22.241Z",
            session: { salesOrderId: "order-1" },
            station: {
              id: "station-1",
              name: "Hot line",
              printerId: "printer-hot",
            },
            kdsTicketLines: [
              {
                id: "line-1",
                productName: "Dish Soap",
                quantity: "2.0000",
                kitchenModifiers: "No ice",
                salesOrderLine: {
                  product: { name: "Dish Soap", categoryId: "grocery" },
                },
              },
            ],
          },
        });
      }
      return Promise.resolve({
        success: true,
        meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
        data: [
          {
            id: "ticket-1",
            ticketNumber: "KDS-20260506-0001",
            status: "PREPARING",
            courseType: "MAIN",
            stationId: "station-1",
          },
        ],
      });
    });
    const repository = new ApiCashierRepository({
      get,
    } as unknown as HttpClient);

    const list = await repository.listKdsTickets({
      page: 1,
      limit: 50,
      activeOnly: true,
    });
    const ticket = await repository.getKdsTicketById("ticket-1");

    expect(get).toHaveBeenCalledWith("/api/v1/kds/tickets", {
      params: { page: 1, limit: 50, activeOnly: true },
    });
    expect(list.tickets[0]).toMatchObject({
      id: "ticket-1",
      status: "PREPARING",
      courseType: "MAIN",
    });
    expect(list.totalPages).toBe(1);
    expect(ticket.ticketNumber).toBe("KDS-20260506-0001");
    expect(ticket.salesOrderId).toBe("order-1");
    expect(ticket.station).toMatchObject({
      name: "Hot line",
      printerId: "printer-hot",
    });
    expect(ticket.lines).toEqual([
      {
        name: "Dish Soap",
        quantity: "2.0000",
        categoryId: "grocery",
        modifiers: "No ice",
      },
    ]);
  });

  it("names the KTV lady who ordered a kitchen ticket line", async () => {
    const get = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: "ticket-2",
        kdsTicketLines: [
          {
            id: "line-1",
            productName: "Fried rice",
            quantity: "1.0000",
            salesOrderLine: { hostess: { name: "Su Su", nickname: "Snow" } },
          },
          {
            id: "line-2",
            productName: "Soda",
            quantity: "1.0000",
            salesOrderLine: { hostess: null },
          },
        ],
      },
    });
    const repository = new ApiCashierRepository({ get } as unknown as HttpClient);

    const ticket = await repository.getKdsTicketById("ticket-2");

    expect(ticket.kdsTicketLines?.map((line) => line.orderedBy)).toEqual(["Snow", undefined]);
    expect(ticket.lines?.map((line) => line.orderedBy)).toEqual(["Snow", undefined]);
  });

  it("reads the option groups a product carries, and tells an empty list from none", async () => {
    const get = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          id: "product-1",
          tenantId: "tenant-1",
          name: "Noodles",
          basePrice: "3000.0000",
          modifierGroups: [
            {
              id: "add-ons",
              name: "Add-ons",
              minSelection: 0,
              maxSelection: 2,
              isRequired: false,
              modifiers: [
                { id: "egg", name: "Egg", priceDelta: "500.0000", isDefault: false },
              ],
            },
          ],
        },
        { id: "product-2", tenantId: "tenant-1", name: "Water", basePrice: "500.0000", modifierGroups: [] },
        { id: "product-3", tenantId: "tenant-1", name: "Tea", basePrice: "1000.0000" },
      ],
      meta: { total: 3, page: 1, limit: 20, totalPages: 1 },
    });
    const repository = new ApiCashierRepository({ get } as unknown as HttpClient);

    const [noodles, water, tea] = await repository.getProducts();

    expect(noodles.modifierGroups).toEqual([
      {
        id: "add-ons",
        name: "Add-ons",
        minSelection: 0,
        maxSelection: 2,
        isRequired: false,
        modifiers: [{ id: "egg", name: "Egg", priceDelta: "500.0000", isDefault: false }],
      },
    ]);
    // An empty list means none attached; a missing field means the payload did not say.
    expect(water.modifierGroups).toEqual([]);
    expect(tea.modifierGroups).toBeUndefined();
  });

  it("creates a product and variant with decimal prices and matrix options", async () => {
    const post = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/variants")) {
        return Promise.resolve({
          success: true,
          data: {
            id: "variant-1",
            productId: "product-1",
            variantSku: "SKU-IP15-BLK-128",
            barcode: "1234567890123",
            matrixOptions: { color: "Black", storage: "128GB" },
            priceModifier: "50.0000",
          },
        });
      }
      return Promise.resolve({
        success: true,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        data: {
          id: "product-1",
          tenantId: "tenant-1",
          name: "iPhone 15",
          baseSku: "SKU-IP15",
          basePrice: "999.0000",
          baseUomId: "uom-1",
          trackingType: "standard",
          isAvailable: true,
          isTaxable: true,
          taxRateId: "tax-1",
          totalOnHand: "250.0000",
          globalAttributes: { brand: "Apple" },
        },
      });
    });
    const repository = new ApiCashierRepository({ post } as unknown as HttpClient);

    const product = await repository.createProduct({
      name: "iPhone 15",
      tenantId: "tenant-1",
      baseSku: "SKU-IP15",
      basePrice: "999",
      baseUomId: "uom-1",
      globalAttributes: { brand: "Apple" },
      trackingType: "STANDARD",
      isAvailable: true,
      isTaxable: true,
      taxRateId: "tax-1",
    });
    const variant = await repository.createVariant("product-1", {
      variantSku: "SKU-IP15-BLK-128",
      matrixOptions: { color: "Black", storage: "128GB" },
      barcode: "1234567890123",
      priceModifier: "50",
    });

    expect(post).toHaveBeenNthCalledWith(1, "/api/v1/products", {
      name: "iPhone 15",
      tenantId: "tenant-1",
      baseSku: "SKU-IP15",
      basePrice: "999.0000",
      baseUomId: "uom-1",
      globalAttributes: { brand: "Apple" },
      trackingType: "STANDARD",
      isAvailable: true,
      isTaxable: true,
      taxRateId: "tax-1",
    });
    expect(product).toMatchObject({
      id: "product-1",
      trackingType: "STANDARD",
      isAvailable: true,
      taxRateId: "tax-1",
      totalOnHand: "250.0000",
      globalAttributes: { brand: "Apple" },
    });
    expect(post).toHaveBeenNthCalledWith(2, "/api/v1/products/product-1/variants", {
      variantSku: "SKU-IP15-BLK-128",
      matrixOptions: { color: "Black", storage: "128GB" },
      barcode: "1234567890123",
      priceModifier: "50.0000",
    });
    expect(variant.matrixOptions).toEqual({ color: "Black", storage: "128GB" });
  });
});
