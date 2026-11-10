import type { SalesOrder, SalesOrderLine } from "@/core/domain/entities/Cashier";
import { modifierExtra } from "@/lib/modifiers/choices";
import { linePriceNote } from "@/lib/pos/linePrice";
import { lineDisplayName } from "@/lib/pos/orderListDisplay";
import { givenAwayAmount, linePromotionSaving } from "@/lib/pos/promotions";
import type { PrintLine, SaleReceipt } from "./formatKdsTicket";
import { sessionPrintTimes } from "./formatKdsTicket";
import { modifierPrintText } from "./modifierText";
import { slipRows } from "@/lib/spa/billLines";
import { groupRoomTimeRows, mergedRoomTimeLine } from "./roomTimeRows";
import { isKtvRoomTimeLine, roomTimeNamer, slipSessionCount, slipTimeRange } from "@/lib/spa/manualTimes";

/** The words a slip prints, in the till's language, as the original slip used them. */
export interface SlipText {
  item: string;
  aHostess: string;
  promo: string;
  tip: string;
  startTime: string;
  endTime: string;
  serviceType: (serviceType: string) => string;
  priceNote: (note: "discount" | "changed", name: string) => string;
}

export interface ReprintInput {
  order: SalesOrder;
  lines: SalesOrderLine[];
  outletName?: string;
  cashier?: string;
  hostessName: (id: string) => string | undefined;
  /** A container or delivery fee has no menu price to compare with. */
  isFeeLine: (line: { variantId: string }) => boolean;
  /** How a room slip writes its start and end, as the room board does. */
  formatDateTime: (iso: string) => string;
  text: SlipText;
}

const money = (value: number) => value.toFixed(4);
const amount = (value: unknown) => Number(value) || 0;

const withNote = (modifiers: { names?: string; prices?: string }, note?: string) =>
  note
    ? {
        names: [modifiers.names, note].filter(Boolean).join(", "),
        prices: [modifiers.prices, "-"].filter(Boolean).join(", "),
      }
    : modifiers;

/** One row per item, as the till's bill shows a repeated round. */
const merged = (lines: (PrintLine & { variantId: string })[]) => {
  const rows = new Map<string, PrintLine & { variantId: string }>();
  for (const line of lines) {
    const key = JSON.stringify([
      line.variantId,
      line.name,
      line.unitPrice,
      line.categoryId,
      line.modifiers,
      line.modifierPrices,
      line.promotion,
      line.remarks,
    ]);
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, line);
      continue;
    }
    rows.set(key, {
      ...existing,
      quantity: String(Number(existing.quantity) + Number(line.quantity)),
      ...(line.promotionAmount
        ? {
            promotionAmount: String(
              Number(existing.promotionAmount || 0) + Number(line.promotionAmount)
            ),
          }
        : {}),
    });
  }
  return [...rows.values()];
};

const paidAtOf = (order: SalesOrder) => {
  const taken = (order.payments || []).filter((payment) => amount(payment.amount) > 0);
  const last = taken[taken.length - 1]?.paidAt || order.updatedAt;
  return last ? new Date(last).toLocaleString() : undefined;
};

/**
 * A paid order's slip printed again from Sales Orders, as it came out when the
 * bill was paid: the cashier's slip for a table or counter sale, the room's slip
 * for a SPA or KTV bill. Built from what the server kept, so it reads the same
 * on any till. The guest's copy only.
 */
export function reprintSlip(input: ReprintInput): SaleReceipt {
  const { order, lines, text } = input;
  const kept = lines.filter((line) => !line.voidedAt && String(line.status || "").toUpperCase() !== "VOIDED");
  const room = order.place && order.place.kind !== "TABLE" ? order.place : null;
  const tip = amount(order.tipAmount);
  const tipRow = tip > 0 ? [{ label: text.tip, amount: money(tip) }] : undefined;
  const payments = (order.payments || []).map((payment) => ({
    name: payment.methodName,
    amount: payment.amount,
  }));
  const hostessNote = (line: SalesOrderLine) => {
    if (!line.hostessId) return undefined;
    // A hostess service prints who served it; anything else she ordered prints
    // her name alone, with no "Ordered by" wording on the paper.
    if (line.askWhoServed && room) return undefined;
    return input.hostessName(line.hostessId) || text.aHostess;
  };
  // A reprint carries the area the order was sold in, so a KTV bill reprinted
  // from the bar screen still comes out on the KTV counter.
  const orderArea: "BAR" | "KTV" | "SPA" =
    order.place?.kind === "KTV"
      ? "KTV"
      : order.place?.kind === "SPA"
        ? "SPA"
        : "BAR";
  const base = {
    title: "RECEIPT",
    place: "CHECKOUT" as const,
    area: orderArea,
    showLogo: true,
    showPrices: true,
    receiptId: order.orderNumber,
    cashier: input.cashier,
    paidAt: paidAtOf(order),
    total: order.grandTotal,
  };

  if (room) {
    const named = roomTimeNamer(
      kept,
      slipTimeRange(room.manualInAt, room.manualOutAt),
      // A KTV room is sold by the hour, so the slip says how many it was.
      room.kind === "KTV"
        ? slipSessionCount(room.manualInAt, room.manualOutAt)
        : undefined
    );
    const prepaid = (order.payments || []).every(
      (payment) => String(payment.methodKind || "").toUpperCase() === "GUEST_CARD"
    );
    return {
      ...base,
      serviceType: room.kind,
      tableOrRoom: room.number,
      startTime: input.formatDateTime(room.openedAt),
      endTime: input.formatDateTime(room.closedAt || order.updatedAt),
      startTimeLabel: text.startTime,
      endTimeLabel: text.endTime,
      lines: groupRoomTimeRows(slipRows(kept), isKtvRoomTimeLine).map((group) => {
        const { line } = group.rows[0];
        const printed = named(line, lineDisplayName(line) || line.productName || text.item);
        // The room's time sold at more than one rate is one row on the paper.
        if (group.rows.length > 1) return mergedRoomTimeLine(group, printed);
        const modifiers = withNote(modifierPrintText(line.selectedModifiers), hostessNote(line));
        return {
          name: printed,
          quantity: String(group.rows[0].quantity || line.quantity || "1"),
          unitPrice: line.unitPrice?.trim() || undefined,
          modifiers: modifiers.names,
          modifierPrices: modifiers.prices,
          ...(line.note ? { remarks: line.note } : {}),
        };
      }),
      amounts: tipRow ?? [],
      ...(prepaid ? {} : { payments }),
    };
  }

  const givenAway = kept.reduce((sum, line) => sum + givenAwayAmount(line), 0);
  const subtotal = amount(order.subtotal) - givenAway;
  const discount = amount(order.totalDiscount) - givenAway;
  const service = order.serviceType ? String(order.serviceType) : "";
  const paid = payments.reduce((sum, payment) => sum + amount(payment.amount), 0);
  const printable = kept.map((line) => {
    const modifiers = withNote(modifierPrintText(line.selectedModifiers), hostessNote(line));
    const away = givenAwayAmount(line) > 0;
    const name = line.productName || line.variantName || text.item;
    const menuPrice =
      input.isFeeLine(line) || line.menuPrice === undefined
        ? undefined
        : Number(line.menuPrice) + modifierExtra(line.selectedModifiers);
    const note = away ? undefined : linePriceNote(line.unitPrice, menuPrice);
    const saving = away ? null : linePromotionSaving(line);
    return {
      variantId: line.variantId,
      name: note ? text.priceNote(note, name) : name,
      quantity: String(line.quantity || "1"),
      unitPrice: away ? money(0) : line.unitPrice?.trim() || undefined,
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      modifiers: modifiers.names,
      modifierPrices: modifiers.prices,
      ...(line.note ? { remarks: line.note } : {}),
      ...(saving && saving.amount > 0
        ? {
            promotion: line.promotionNames?.join(", ") || text.promo,
            promotionAmount: money(saving.amount),
          }
        : {}),
    };
  });

  return {
    ...base,
    outletName: input.outletName,
    serviceType: service ? text.serviceType(service) : undefined,
    tableOrRoom: order.place?.number,
    pickupCode: order.pickupNumber,
    ...sessionPrintTimes(order.place, order.place?.closedAt || order.updatedAt),
    lines: merged(printable),
    subtotal: money(subtotal),
    discount: discount > 0 ? money(discount) : undefined,
    tax: amount(order.totalTax) > 0 ? order.totalTax : undefined,
    serviceCharge: amount(order.serviceCharge) > 0 ? order.serviceCharge : undefined,
    ...(tipRow ? { amounts: tipRow } : {}),
    payments,
    change: Math.max(0, paid - amount(order.grandTotal)).toFixed(2),
  };
}
