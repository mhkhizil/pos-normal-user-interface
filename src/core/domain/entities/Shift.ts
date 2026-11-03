export type PosKind = "BAR" | "KTV" | "SPA";
export type ShiftRule = "PER_LOGIN" | "DAILY";

export interface OpenShift {
  id: string;
  openedAt: string;
  openingCashFloat: number;
  cashierId: string;
  cashierName: string | null;
}

/** A POS device and the shift open on it now. */
export interface CurrentShift {
  registerId: string;
  registerName: string;
  shiftRule: ShiftRule;
  /** The screens this POS device shows. */
  sellsAt: PosKind[];
  shift: OpenShift | null;
  /** A daily shift is due a day after it opened; a per-login one has none. */
  dueAt: string | null;
  overdue: boolean;
}

export interface ShiftSummary {
  sessionId: string;
  registerName: string;
  cashierName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingCashFloat: number;
  expectedClosingCash: number;
  actualClosingCash: number | null;
  cashVariance: number | null;
  totalSales: number;
  totalRefunds: number;
  netTotal: number;
  salesCount: number;
  refundCount: number;
  nonSalesCashIn: number;
  nonSalesCashOut: number;
  /** The tips taken on this shift, when the summary reports them. */
  tipAmount?: number;
  paymentBreakdown: { methodName: string; transactionCount: number; totalAmount: number }[];
  /** What it sold by group; missing when the server could not say. */
  groups?: ShiftSalesGroups;
}

export type ShiftSectionKind = "STATION" | "STAFF_MEAL" | "OTHER";

/**
 * A shift's sales by where they were made. Amounts are net sales: after discounts,
 * before tax and service charge; a free item counts at 0, a void not at all.
 */
export interface ShiftSalesGroups {
  sections: {
    key: string;
    kind: ShiftSectionKind;
    /** The KDS station; null for staff meal and other. */
    name: string | null;
    items: { variantId: string; name: string; quantity: number; amount: number }[];
    quantity: number;
    amount: number;
  }[];
  rooms: { rows: { room: string; hours: number; amount: number }[]; hours: number; amount: number };
  takeaway: { orders: number; amount: number };
  credit: { rows: { account: string; orderNumber: string; amount: number }[]; amount: number };
}

export interface ManagerApproval {
  token: string;
  approverName: string | null;
}
