import { modifierRefs } from "@/lib/modifiers/choices";

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const toMoney = (value: unknown): string =>
  Math.max(0, toAmount(value)).toFixed(4);

export function payableTotal(args: {
  lineTotal: number;
  orderDiscount?: number;
  serviceCharge?: number;
  tipAmount?: number;
}): number {
  return Math.max(
    0,
    toAmount(args.lineTotal) -
      Math.max(0, toAmount(args.orderDiscount)) +
      Math.max(0, toAmount(args.serviceCharge)) +
      Math.max(0, toAmount(args.tipAmount))
  );
}

/** Applies only still-pending adjustments to a server grand total, which already includes tax and service charge. */
export function payableFromServerGrandTotal(args: {
  serverGrandTotal: number;
  orderDiscount?: number;
  tipAmount?: number;
}): number {
  return payableTotal({
    lineTotal: args.serverGrandTotal,
    orderDiscount: args.orderDiscount,
    tipAmount: args.tipAmount,
  });
}

export function lineGrossAmount(line: {
  quantity?: string | number;
  unitPrice?: string | number;
}): number {
  return Math.max(0, toAmount(line.quantity) * toAmount(line.unitPrice));
}

export function lineFocDiscount(line: {
  quantity?: string | number;
  unitPrice?: string | number;
}): string {
  return toMoney(lineGrossAmount(line));
}

export function isFocLine(line: {
  quantity?: string | number;
  unitPrice?: string | number;
  lineDiscount?: string | number;
}): boolean {
  const gross = lineGrossAmount(line);
  return gross > 0 && toAmount(line.lineDiscount) >= gross - 0.009;
}

/**
 * The checkout items, with the order discount spread over them in order. An
 * extra fee takes none of it, and carries its own amount and name; an item the
 * cashier repriced carries its price.
 */
export function allocateOrderDiscountToLines<
  T extends {
    variantId: string;
    quantity: string | number;
    unitPrice?: string | number;
    lineDiscount?: string | number;
    productName?: string;
    selectedModifiers?: unknown;
    priceOverride?: string;
    hostessId?: string;
    note?: string;
  },
>(
  lines: T[],
  orderDiscount: number,
  isFee: (line: T) => boolean = () => false
): Array<{
  variantId: string;
  quantity: string;
  lineDiscount: string;
  unitPrice?: string;
  name?: string;
  selectedModifiers?: Array<{ modifierId: string }>;
  hostessId?: string;
  note?: string;
}> {
  let remaining = Math.max(0, toAmount(orderDiscount));
  return lines.map((line) => {
    const fee = isFee(line);
    const existing = Math.max(0, toAmount(line.lineDiscount));
    const available = fee ? 0 : Math.max(0, lineGrossAmount(line) - existing);
    const extra = Math.min(remaining, available);
    remaining -= extra;
    const modifiers = modifierRefs(line.selectedModifiers);
    return {
      variantId: line.variantId,
      quantity: toMoney(Math.max(0.0001, toAmount(line.quantity) || 1)),
      lineDiscount: toMoney(existing + extra),
      ...(fee && {
        unitPrice: toMoney(line.unitPrice),
        ...(line.productName ? { name: line.productName } : {}),
      }),
      ...(!fee && line.priceOverride ? { unitPrice: toMoney(line.priceOverride) } : {}),
      ...(modifiers.length ? { selectedModifiers: modifiers } : {}),
      ...(line.hostessId ? { hostessId: line.hostessId } : {}),
      ...(line.note ? { note: line.note } : {}),
    };
  });
}

/** Puts the order tip on the first payment, for any settle/checkout payment shape. */
export function withOrderTipOnFirstPayment<
  T extends { paymentMethodId: string; tipAmount?: string },
>(payments: T[], tipAmount?: string | number): T[] {
  const tip = toAmount(tipAmount);
  if (tip <= 0) return payments;
  const tipMoney = toMoney(tip);
  return payments.map((payment, index) =>
    index === 0 ? ({ ...payment, tipAmount: tipMoney } as T) : payment
  );
}
