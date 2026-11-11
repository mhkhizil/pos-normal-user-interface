import { describe, expect, it } from "vitest";
import { SalesOrder, SalesOrderLine } from "@/core/domain/entities/Cashier";
import { reprintSlip, type SlipText } from "../reprintSlip";

const text: SlipText = {
  item: "Item",
  aHostess: "a hostess",
  promo: "PROMO",
  tip: "Tip",
  startTime: "Start time",
  endTime: "End time",
  serviceType: (service) => (service === "DINE_IN" ? "Dine In" : service),
  priceNote: (note, name) => `${name} (${note === "discount" ? "Discount" : "Price changed"})`,
};

const line = (id: string, over: Partial<SalesOrderLine> = {}) =>
  new SalesOrderLine({
    id,
    salesOrderId: "order-1",
    variantId: `variant-${id}`,
    productName: id,
    quantity: "1.0000",
    unitPrice: "3000.0000",
    menuPrice: "3000",
    status: "SERVED",
    ...over,
  });

const order = (over: Partial<SalesOrder> = {}) =>
  new SalesOrder({
    id: "order-1",
    orderNumber: "SO-42",
    status: "COMPLETED",
    serviceType: "DINE_IN",
    subtotal: "15000.0000",
    totalDiscount: "3000.0000",
    totalTax: "750.0000",
    serviceCharge: "500.0000",
    tipAmount: "1000.0000",
    grandTotal: "14250.0000",
    updatedAt: "2026-11-01T13:12:00.000Z",
    place: {
      kind: "TABLE",
      number: "T5",
      openedAt: "2026-11-01T11:40:00.000Z",
      closedAt: "2026-11-01T13:10:00.000Z",
    },
    payments: [
      { methodName: "Cash", methodKind: "CASH", amount: "15000.0000", paidAt: "2026-11-01T13:11:00.000Z" },
    ],
    ...over,
  });

const build = (o: SalesOrder, lines: SalesOrderLine[], showTax?: boolean) =>
  reprintSlip({
    showTax,
    order: o,
    lines,
    outletName: "Yankin",
    cashier: "Ko Aung",
    hostessName: (id) => (id === "mya" ? "Mya" : undefined),
    isFeeLine: () => false,
    formatDateTime: (iso) => `at ${iso}`,
    text,
  });

describe("reprintSlip", () => {
  it("prints a table bill as the cashier's slip did", () => {
    const slip = build(order(), [
      line("beer", { quantity: "2.0000", appliedPromotionId: "p1", lineDiscount: "3000.0000", promotionNames: ["1+1"] }),
      line("cola"),
      line("cola", { id: "cola-2" }),
      line("rice", { unitPrice: "6000.0000", menuPrice: "6000", hostessId: "mya" }),
      line("sprite", { status: "VOIDED", voidedAt: "2026-11-01T12:00:00.000Z" }),
    ]);

    expect(slip).toMatchObject({
      title: "RECEIPT",
      receiptId: "SO-42",
      outletName: "Yankin",
      cashier: "Ko Aung",
      serviceType: "Dine In",
      tableOrRoom: "T5",
      subtotal: "15000.0000",
      discount: "3000.0000",
      tax: "750.0000",
      serviceCharge: "500.0000",
      amounts: [{ label: "Tip", amount: "1000.0000" }],
      total: "14250.0000",
      payments: [{ name: "Cash", amount: "15000.0000" }],
      change: "750.00",
    });
    expect(slip.sale).toBeUndefined();
    expect(slip.startTime).toBeTruthy();
    expect(slip.lines.map((item) => [item.name, item.quantity])).toEqual([
      ["beer", "2.0000"],
      ["cola", "2"],
      ["rice", "1.0000"],
    ]);
    expect(slip.lines[0]).toMatchObject({ promotion: "1+1", promotionAmount: "3000.0000" });
    // Who ordered prints as her name alone, with no "Ordered by" wording.
    expect(slip.lines[2].modifiers).toBe("Mya");
  });

  it("prints no tax line where the shop hides it, with the same total", () => {
    const slip = build(order(), [line("cola")], false);
    expect(slip.tax).toBeUndefined();
    expect(slip.total).toBe(build(order(), [line("cola")]).total);
  });

  it("notes a price changed on this bill, and prints a free copy at 0", () => {
    const slip = build(order(), [
      line("water", { unitPrice: "1500.0000", menuPrice: "2000" }),
      line("cola", { appliedPromotionId: "p2", lineDiscount: "3000.0000" }),
    ]);

    expect(slip.lines[0].name).toBe("water (Discount)");
    expect(slip.lines[1]).toMatchObject({ name: "cola", unitPrice: "0.0000" });
    expect(slip.subtotal).toBe("12000.0000");
    expect(slip.discount).toBeUndefined();
  });

  it("prints a KTV bill as the room's slip did", () => {
    const slip = build(
      order({
        serviceType: "DINE_IN",
        tipAmount: "0.0000",
        place: {
          kind: "KTV",
          number: "K3",
          openedAt: "2026-11-01T11:40:00.000Z",
          closedAt: "2026-11-01T13:10:00.000Z",
          manualInAt: new Date(2026, 10, 1, 16, 15).toISOString(),
          manualOutAt: new Date(2026, 10, 1, 18, 15).toISOString(),
        },
        payments: [{ methodName: "Guest Card", methodKind: "GUEST_CARD", amount: "14250.0000" }],
      }),
      [
        line("room", { categoryName: "KTV Rooms", courseType: "Hours · Standard" }),
        line("beer", { hostessId: "mya" }),
        line("hostess", { hostessId: "mya", askWhoServed: true }),
      ]
    );

    expect(slip).toMatchObject({
      serviceType: "KTV",
      tableOrRoom: "K3",
      startTime: "at 2026-11-01T11:40:00.000Z",
      endTime: "at 2026-11-01T13:10:00.000Z",
      startTimeLabel: "Start time",
      endTimeLabel: "End time",
      amounts: [],
      total: "14250.0000",
    });
    expect(slip.subtotal).toBeUndefined();
    expect(slip.payments).toBeUndefined();
    expect(slip.lines.map((item) => item.modifiers)).toEqual([undefined, "Mya", undefined]);
    // A KTV room is sold by the hour: the slip says how many the guest used.
    expect(slip.lines[0].name).toBe("room (2h) (4:15 - 6:15)");
  });

  it("prints a room booked and then extended as one row", () => {
    const room = { categoryName: "KTV Rooms", courseType: "Hours · Standard", unitPrice: "40000.0000" };
    const slip = build(
      order({
        place: {
          kind: "KTV",
          number: "102",
          openedAt: "2026-11-02T08:57:00.000Z",
          closedAt: "2026-11-02T09:04:00.000Z",
          manualInAt: new Date(2026, 10, 2, 15, 30).toISOString(),
          manualOutAt: new Date(2026, 10, 2, 17, 30).toISOString(),
        },
      }),
      [line("room", room), line("jager", { hostessId: "mya" }), line("room", { ...room, id: "room-2" })]
    );

    expect(slip.lines.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ["room (2h) (3:30 - 5:30)", "2", "40000.0000"],
      ["jager", "1", "3000.0000"],
    ]);
  });
});
