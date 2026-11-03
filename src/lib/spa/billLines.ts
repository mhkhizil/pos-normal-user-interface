import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { isFocLine } from "@/lib/pos/checkoutAdjustments";

export interface BillLineGroup {
  key: string;
  /** The bill's own lines, oldest first; each room order keeps its own. */
  lines: SalesOrderLine[];
  quantity: number;
  total: number;
}

const lineTotal = (line: SalesOrderLine) =>
  Number(line.quantity || 0) * Number(line.unitPrice || 0) - Number(line.lineDiscount || 0);

/** The copy a promotion gives away: nothing is charged for it. */
const isPromotionFree = (line: SalesOrderLine) =>
  Boolean(line.appliedPromotionId) && lineTotal(line) <= 0.005;

/** Given free (FOC) by the staff, rather than by a promotion. */
export const isGivenFree = (line: SalesOrderLine) =>
  isFocLine(line) && !line.appliedPromotionId;

/**
 * Every order sent from a room is saved as lines of its own, so a second round of
 * the same drink is a second line. On the bill they read as one row; only lines
 * sold alike (price, hostess, free, promotion, options) are put together. A copy
 * a promotion left unpaid keeps a row of its own, so it reads 0 on the bill.
 */
export function groupBillLines(lines: SalesOrderLine[]): BillLineGroup[] {
  const groups = new Map<string, BillLineGroup>();
  for (const line of lines) {
    const key = [
      line.variantId,
      Number(line.unitPrice || 0),
      line.hostessId ?? "",
      line.compReasonId || isGivenFree(line) ? "foc" : "",
      line.appliedPromotionId ?? "",
      isPromotionFree(line) ? "promo-free" : "",
      line.productName ?? "",
      JSON.stringify(line.selectedModifiers ?? []),
      line.note ?? "",
    ].join("|");
    const group = groups.get(key);
    if (group) {
      group.lines.push(line);
      group.quantity += Number(line.quantity || 0);
      group.total += lineTotal(line);
    } else {
      groups.set(key, {
        key,
        lines: [line],
        quantity: Number(line.quantity || 0),
        total: lineTotal(line),
      });
    }
  }
  return [...groups.values()];
}

/**
 * The bill's lines as the slip prints them: one row per group, as on the bill,
 * with its oldest line standing for the rest. A room booked and then extended is
 * one row, not one per round.
 */
export function slipRows(lines: SalesOrderLine[]): Array<{ line: SalesOrderLine; quantity: number }> {
  return groupBillLines(lines).map((group) => ({ line: group.lines[0], quantity: group.quantity }));
}
