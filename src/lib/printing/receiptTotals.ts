import type { SalesOrderBillDTO } from "@/core/application/dtos/SalesOrderDTO";
import type { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { givenAwayDiscount } from "@/lib/pos/promotions";
import type { SaleReceipt } from "./formatKdsTicket";

/** The money rows a paid bill prints above its total. */
export type ReceiptTotals = Pick<
  SaleReceipt,
  "subtotal" | "discount" | "tax" | "serviceCharge"
>;

/**
 * A settled bill's money rows, worked out the way the cashier prints them: the
 * items at the bill's prices without the copies a promotion gave away, then
 * what the discounts take off, the service charge and all the tax. A row with
 * nothing in it is left out, so a bill without tax reads without a tax line. A
 * shop that hides tax in this area prints no tax line either, though it is charged.
 */
export function receiptTotals(
  bill:
    | Pick<SalesOrderBillDTO, "subtotal" | "totalDiscount" | "serviceCharge" | "totalTax">
    | null
    | undefined,
  lines: SalesOrderLine[],
  showTax = true
): ReceiptTotals {
  if (!bill) return {};
  // A copy a promotion gave away prints at 0, so it is out of both rows; what
  // is left still adds up along the slip.
  const givenAway = givenAwayDiscount(lines);
  const subtotal = Number(bill.subtotal || 0) - givenAway;
  const discount = Number(bill.totalDiscount || 0) - givenAway;
  const tax = Number(bill.totalTax || 0);
  const serviceCharge = Number(bill.serviceCharge || 0);
  const money = (value: number) => value.toFixed(4);
  return {
    subtotal: money(subtotal),
    ...(discount > 0 ? { discount: money(discount) } : {}),
    ...(showTax && tax > 0 ? { tax: money(tax) } : {}),
    ...(serviceCharge > 0 ? { serviceCharge: money(serviceCharge) } : {}),
  };
}
