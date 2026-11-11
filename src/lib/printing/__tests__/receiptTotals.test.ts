import { describe, expect, it } from "vitest";
import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { buildSaleReceiptLines } from "../formatKdsTicket";
import { receiptTotals } from "../receiptTotals";

const bill = (over: Record<string, string> = {}) => ({
  subtotal: "115000.0000",
  totalDiscount: "0.0000",
  serviceCharge: "11500.0000",
  totalTax: "3300.0000",
  ...over,
});

const line = (over: Record<string, string> = {}) =>
  new SalesOrderLine({
    id: "line-1",
    salesOrderId: "order-1",
    variantId: "variant-beer",
    productName: "Beer",
    quantity: "1.0000",
    unitPrice: "115000.0000",
    ...over,
  });

describe("receiptTotals", () => {
  it("gives a settled bill the rows the cashier prints", () => {
    expect(receiptTotals(bill(), [line()])).toEqual({
      subtotal: "115000.0000",
      serviceCharge: "11500.0000",
      tax: "3300.0000",
    });
  });

  it("prints the discount when the bill took one off", () => {
    expect(receiptTotals(bill({ totalDiscount: "5000.0000" }), [line()])).toEqual({
      subtotal: "115000.0000",
      discount: "5000.0000",
      serviceCharge: "11500.0000",
      tax: "3300.0000",
    });
  });

  it("leaves out a tax or service charge the bill does not carry", () => {
    expect(
      receiptTotals(bill({ serviceCharge: "0.0000", totalTax: "0.0000" }), [line()])
    ).toEqual({ subtotal: "115000.0000" });
  });

  it("leaves out the tax line where the shop hides it, keeping the other rows", () => {
    expect(receiptTotals(bill(), [line()], false)).toEqual({
      subtotal: "115000.0000",
      serviceCharge: "11500.0000",
    });
  });

  it("takes the copies a promotion gave away out of the items and the discount", () => {
    const free = line({
      id: "line-2",
      appliedPromotionId: "bogo",
      lineDiscount: "115000.0000",
    });
    expect(
      receiptTotals(bill({ totalDiscount: "120000.0000" }), [line(), free])
    ).toEqual({
      subtotal: "0.0000",
      discount: "5000.0000",
      serviceCharge: "11500.0000",
      tax: "3300.0000",
    });
  });

  it("prints no rows when the bill could not be read", () => {
    expect(receiptTotals(null, [line()])).toEqual({});
    expect(receiptTotals(undefined, [])).toEqual({});
  });

  it("reads on the slip the way the cashier's receipt does", () => {
    const text = buildSaleReceiptLines({
      title: "RECEIPT",
      lines: [{ name: "Beer", quantity: "1", unitPrice: "115000" }],
      ...receiptTotals(bill(), [line()]),
      total: "129800.0000",
    }).join("\n");

    expect(text).toMatch(/Subtotal\s+115,000/);
    expect(text).toMatch(/Tax\s+3,300/);
    expect(text).toMatch(/Service charge\s+11,500/);
    expect(text).toMatch(/TOTAL\s+129,800/);
  });
});
