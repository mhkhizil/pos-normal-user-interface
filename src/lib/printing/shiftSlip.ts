import type { ShiftSummary } from "@/core/domain/entities/Shift";
import { shiftGroupBlocks } from "@/lib/pos/shiftGroups";
import { formatPrintDate, SaleReceipt } from "./formatKdsTicket";

const amountText = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const UNIT = { qty: "", hours: " h", orders: " orders", bill: "" } as const;

/** A shift's report as the till's receipt printer prints it. */
export function shiftSlip(summary: ShiftSummary): SaleReceipt {
  return {
    title: "Shift report",
    place: "CHECKOUT",
    templateType: "SHIFT",
    paidAt: summary.closedAt || undefined,
    cashier: summary.cashierName || undefined,
    facts: [
      { label: "POS device", value: summary.registerName },
      { label: "Opened", value: formatPrintDate(summary.openedAt) },
      { label: "Closed", value: summary.closedAt ? formatPrintDate(summary.closedAt) : "Still open" },
      { label: "Sales", value: `${summary.salesCount} ${summary.salesCount === 1 ? "bill" : "bills"}` },
      ...(summary.refundCount
        ? [{ label: "Refunds", value: `${summary.refundCount} ${summary.refundCount === 1 ? "bill" : "bills"}` }]
        : []),
    ],
    lines: [],
    sections: summary.groups
      ? shiftGroupBlocks(summary.groups, {
          staffMeal: "Staff meal",
          other: "Other",
          rooms: "Rooms",
          takeaway: "Take away",
          credit: "Credit",
          noAccount: "No account",
        }).map((block) => ({
          title: block.title.toUpperCase(),
          rows: block.rows.map((row) => ({
            left:
              block.unit === "bill"
                ? `${row.name} ${row.count}`
                : `${row.count}${UNIT[block.unit]} x ${row.name}`,
            right: amountText(row.amount),
          })),
          total: {
            left: block.total.count
              ? `Total ${block.total.count}${
                  block.unit === "orders" && block.total.count === "1" ? " order" : UNIT[block.unit]
                }`
              : "Total",
            right: amountText(block.total.amount),
          },
        }))
      : undefined,
    amounts: [
      { label: "Sales", amount: String(summary.totalSales) },
      { label: "Refunds", amount: String(-Math.abs(summary.totalRefunds)) },
      ...(summary.tipAmount
        ? [{ label: "Tips", amount: String(summary.tipAmount) }]
        : []),
    ],
    totalLabel: "NET",
    total: String(summary.netTotal),
    payments: summary.paymentBreakdown.map((row) => ({
      name: `${row.methodName} (${row.transactionCount})`,
      amount: String(row.totalAmount),
    })),
  };
}
