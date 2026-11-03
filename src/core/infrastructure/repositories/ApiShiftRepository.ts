import type {
  CurrentShift,
  PosKind,
  ManagerApproval,
  ShiftSalesGroups,
  ShiftSectionKind,
  ShiftSummary,
} from "../../domain/entities/Shift";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";

type RecordValue = Record<string, unknown>;

const asRecord = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};

const unwrap = (response: unknown, key: string): RecordValue => {
  const record = asRecord(response);
  return "data" in record && !(key in record) ? unwrap(record.data, key) : record;
};

const money = (value: unknown) => Number(value ?? 0) || 0;

const POS_KINDS: PosKind[] = ["BAR", "KTV", "SPA"];
const sellsAtOf = (value: unknown): PosKind[] => {
  const kinds = Array.isArray(value) ? POS_KINDS.filter((kind) => value.includes(kind)) : [];
  return kinds.length ? kinds : POS_KINDS;
};
const moneyOrNull = (value: unknown) => (value == null ? null : money(value));

const toCurrent = (response: unknown): CurrentShift => {
  const body = unwrap(response, "registerId");
  const shift = body.shift ? asRecord(body.shift) : null;
  return {
    registerId: String(body.registerId || ""),
    registerName: String(body.registerName || ""),
    shiftRule: body.shiftRule === "DAILY" ? "DAILY" : "PER_LOGIN",
    sellsAt: sellsAtOf(body.sellsAt),
    shift: shift
      ? {
          id: String(shift.id || ""),
          openedAt: String(shift.openedAt || ""),
          openingCashFloat: money(shift.openingCashFloat),
          cashierId: String(shift.cashierId || ""),
          cashierName: shift.cashierName ? String(shift.cashierName) : null,
        }
      : null,
    dueAt: body.dueAt ? String(body.dueAt) : null,
    overdue: Boolean(body.overdue),
  };
};

const rows = (value: unknown) => (Array.isArray(value) ? value.map(asRecord) : []);
const KINDS: ShiftSectionKind[] = ["STATION", "STAFF_MEAL", "OTHER"];

export const toSalesGroups = (response: unknown): ShiftSalesGroups => {
  const body = unwrap(response, "sections");
  const rooms = asRecord(body.rooms);
  const takeaway = asRecord(body.takeaway);
  const credit = asRecord(body.credit);
  return {
    sections: rows(body.sections).map((section) => ({
      key: String(section.key || ""),
      kind: KINDS.find((kind) => kind === section.kind) ?? "OTHER",
      name: section.name ? String(section.name) : null,
      items: rows(section.items).map((item) => ({
        variantId: String(item.variantId || ""),
        name: String(item.name || ""),
        quantity: money(item.quantity),
        amount: money(item.amount),
      })),
      quantity: money(section.quantity),
      amount: money(section.amount),
    })),
    rooms: {
      rows: rows(rooms.rows).map((row) => ({
        room: String(row.room || ""),
        hours: money(row.hours),
        amount: money(row.amount),
      })),
      hours: money(rooms.hours),
      amount: money(rooms.amount),
    },
    takeaway: { orders: Number(takeaway.orders || 0), amount: money(takeaway.amount) },
    credit: {
      rows: rows(credit.rows).map((row) => ({
        account: String(row.account || ""),
        orderNumber: String(row.orderNumber || ""),
        amount: money(row.amount),
      })),
      amount: money(credit.amount),
    },
  };
};

const toSummary = (response: unknown): ShiftSummary => {
  const body = unwrap(response, "sessionId");
  const totals = asRecord(body.totals);
  const breakdown = Array.isArray(body.paymentBreakdown) ? body.paymentBreakdown : [];
  return {
    sessionId: String(body.sessionId || ""),
    registerName: String(body.registerName || ""),
    cashierName: body.cashierName ? String(body.cashierName) : null,
    openedAt: String(body.openedAt || ""),
    closedAt: body.closedAt ? String(body.closedAt) : null,
    openingCashFloat: money(body.openingCashFloat),
    expectedClosingCash: money(body.expectedClosingCash),
    actualClosingCash: moneyOrNull(body.actualClosingCash),
    cashVariance: moneyOrNull(body.cashVariance),
    totalSales: money(body.totalSales),
    totalRefunds: money(body.totalRefunds),
    netTotal: money(body.netTotal),
    salesCount: Number(body.salesCount || 0),
    refundCount: Number(body.refundCount || 0),
    nonSalesCashIn: money(body.nonSalesCashIn),
    nonSalesCashOut: money(body.nonSalesCashOut),
    // Whatever the endpoint calls it: a top-level figure, or one inside totals.
    tipAmount: money(body.tipAmount ?? totals.tipAmount),
    paymentBreakdown: breakdown.map((row) => {
      const item = asRecord(row);
      return {
        methodName: String(item.methodName || ""),
        transactionCount: Number(item.transactionCount || 0),
        totalAmount: money(item.totalAmount),
      };
    }),
  };
};

export class ApiShiftRepository {
  constructor(private httpClient: HttpClient) {}

  async current(registerId: string): Promise<CurrentShift> {
    return toCurrent(
      await this.httpClient.get(API_ENDPOINTS.POS_SESSIONS.CURRENT, { params: { registerId } })
    );
  }

  /** Opens a shift for whoever is signed in; the drawer is not counted. */
  async open(input: { tenantId: string; registerId: string; cashierId: string }) {
    const response = await this.httpClient.post(API_ENDPOINTS.POS_SESSIONS.CREATE, {
      tenantId: input.tenantId,
      registerId: input.registerId,
      cashierId: input.cashierId,
      openingCashFloat: "0.0000",
    });
    return String(unwrap(response, "id").id || "");
  }

  async summary(sessionId: string): Promise<ShiftSummary> {
    const [summary, groups] = await Promise.all([
      this.httpClient.get(API_ENDPOINTS.POS_SESSIONS.SUMMARY(sessionId)),
      this.salesGroups(sessionId),
    ]);
    return { ...toSummary(summary), ...(groups ? { groups } : {}) };
  }

  /** Closes the shift for its sales report; nobody counts the drawer. */
  async close(sessionId: string): Promise<ShiftSummary> {
    const summary = toSummary(
      await this.httpClient.post(API_ENDPOINTS.POS_SESSIONS.CLOSE(sessionId), {})
    );
    const groups = await this.salesGroups(sessionId);
    return { ...summary, ...(groups ? { groups } : {}) };
  }

  /** The report still shows its totals when the groups cannot be had. */
  private async salesGroups(sessionId: string): Promise<ShiftSalesGroups | undefined> {
    try {
      return toSalesGroups(
        await this.httpClient.get(API_ENDPOINTS.POS_SESSIONS.SALES_GROUPS(sessionId))
      );
    } catch {
      return undefined;
    }
  }

  /** A manager types their own login on this till; the token approves one thing for 5 minutes. */
  async approve(userId: string, password: string, permission: string): Promise<ManagerApproval> {
    const body = unwrap(
      await this.httpClient.post(API_ENDPOINTS.AUTH.APPROVE, { userId, password, permission }),
      "approval_token"
    );
    const approver = asRecord(body.approver);
    return {
      token: String(body.approval_token || ""),
      approverName: approver.fullName ? String(approver.fullName) : null,
    };
  }
}
