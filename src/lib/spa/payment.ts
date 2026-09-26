import { SettlePaymentDTO } from "@/core/application/dtos/SalesOrderDTO";

const toMoney = (value: number): string => Math.max(0, value).toFixed(4);

export function estimateCardCharge({
  runningTotal,
  discountBps,
  tip,
  cash,
}: {
  runningTotal: string | number;
  discountBps?: number;
  tip?: number;
  cash?: number;
}): number {
  const total = Math.max(0, Number(runningTotal || 0));
  const discount = (total * Math.max(0, discountBps || 0)) / 10000;
  return Math.max(0, total - discount + (tip || 0) - (cash || 0));
}

export function buildSpaSettlePayments({
  cardMethodId,
  guestCardId,
  cashMethodId,
  cashAmount,
}: {
  cardMethodId: string;
  guestCardId: string;
  cashMethodId?: string;
  cashAmount?: number;
}): SettlePaymentDTO[] {
  const payments: SettlePaymentDTO[] = [];
  if (cashAmount && cashAmount > 0) {
    if (!cashMethodId) throw new Error("Cash is not set up as a payment method");
    payments.push({ paymentMethodId: cashMethodId, amount: toMoney(cashAmount) });
  }
  payments.push({ paymentMethodId: cardMethodId, guestCardId });
  return payments;
}
