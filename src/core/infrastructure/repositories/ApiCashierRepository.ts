import {
  CheckoutRequestDTO,
  CreateOrderPaymentDTO,
  CreateSalesOrderDTO,
  CreateTipPoolDTO,
  CreateWaitlistEntryDTO,
  DiningTableFilterDTO,
  FireKdsDTO,
  KdsTicketFilterDTO,
  KdsTicketListDTO,
  OpenTableSessionDTO,
  PosRegisterFilterDTO,
  PosSessionFilterDTO,
  ProductFilterDTO,
  SalesOrderFilterDTO,
  SeatWaitlistEntryDTO,
  TableSessionCheckoutDTO,
  TableSessionFilterDTO,
  CreatePosRegisterDTO,
  CreatePosSessionDTO,
  TipPoolAllocationDTO,
  TipPoolFilterDTO,
  fromApiServiceType,
  toApiServiceType,
  UpdateTableSessionStateDTO,
  UpdateSalesOrderLineDTO,
  UpdateTipPoolDTO,
  UpdateWaitlistEntryDTO,
  UpsertSalesOrderLineDTO,
  VoidCheckoutResultDTO,
  WaitlistFilterDTO,
} from "../../application/dtos/CashierDTO";
import { ICashierRepository } from "../../domain/repositories/ICashierRepository";
import {
  AdjustmentReason,
  CounterOrderDetail,
  DiningTable,
  DiningZone,
  InventoryLocation,
  KdsTicket,
  KdsTicketLine,
  KdsStation,
  OrderPayment,
  PaymentMethod,
  PosRegister,
  PosSession,
  Product,
  ProductVariant,
  SalesOrder,
  SalesOrderLine,
  TableSession,
  TipPool,
  TipPoolAllocation,
  WaitlistEntry,
} from "../../domain/entities/Cashier";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS, resolveMediaUrl } from "../api/constants";

interface ApiEnvelope<T> {
  data: T;
}

const unwrap = <T>(response: ApiEnvelope<T> | T): T => {
  if (response && typeof response === "object" && "data" in response) {
    return unwrap((response as ApiEnvelope<T>).data);
  }
  return response as T;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toDecimalString = (value: unknown, fallback = "0.0000"): string => {
  const parsed = toNumber(value);
  if (parsed === undefined) return fallback;
  return parsed.toFixed(4);
};

const normalizeUpsertLinePayload = (
  payload: UpsertSalesOrderLineDTO
): Record<string, unknown> => {
  const quantity = Math.max(0.0001, toNumber(payload.quantity) ?? 1);
  const unitPrice = toNumber(payload.unitPrice) ?? 0;
  const lineDiscount = toNumber(payload.lineDiscount) ?? 0;
  const taxAmount =
    payload.taxAmount !== undefined ? toNumber(payload.taxAmount) : undefined;

  return {
    variantId: payload.variantId,
    quantity,
    unitPrice,
    lineDiscount,
    ...(payload.taxRateId ? { taxRateId: payload.taxRateId } : {}),
    ...(taxAmount !== undefined ? { taxAmount } : {}),
    ...(payload.appliedPromotionId
      ? { appliedPromotionId: payload.appliedPromotionId }
      : {}),
    ...(payload.courseType ? { courseType: payload.courseType } : {}),
    ...(payload.selectedModifiers
      ? {
          selectedModifiers: payload.selectedModifiers.map((modifier) => ({
            ...modifier,
            priceDelta: toNumber(modifier.priceDelta) ?? 0,
          })),
        }
      : {}),
    ...(payload.seatNumber !== undefined ? { seatNumber: payload.seatNumber } : {}),
  };
};

const normalizeSalesOrderLinePayload = (
  payload: UpsertSalesOrderLineDTO
): Record<string, unknown> => {
  const quantity = Math.max(0.0001, toNumber(payload.quantity) ?? 1);
  const unitPrice = toNumber(payload.unitPrice) ?? 0;
  const lineDiscount = toNumber(payload.lineDiscount) ?? 0;
  const taxAmount =
    payload.taxAmount !== undefined ? toNumber(payload.taxAmount) : undefined;

  return {
    variantId: payload.variantId,
    quantity: toDecimalString(quantity),
    unitPrice: toDecimalString(unitPrice),
    lineDiscount: toDecimalString(lineDiscount),
    ...(payload.taxRateId ? { taxRateId: payload.taxRateId } : {}),
    ...(taxAmount !== undefined ? { taxAmount: toDecimalString(taxAmount) } : {}),
    ...(payload.appliedPromotionId
      ? { appliedPromotionId: payload.appliedPromotionId }
      : {}),
    ...(payload.courseType ? { courseType: payload.courseType } : {}),
    ...(payload.selectedModifiers
      ? {
          selectedModifiers: payload.selectedModifiers.map((modifier) => ({
            ...modifier,
            priceDelta: toDecimalString(toNumber(modifier.priceDelta) ?? 0),
          })),
        }
      : {}),
    ...(payload.seatNumber !== undefined ? { seatNumber: payload.seatNumber } : {}),
  };
};

const normalizeSalesOrderPartialLinePayload = (
  payload: UpdateSalesOrderLineDTO
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};

  if (payload.variantId !== undefined) normalized.variantId = payload.variantId;
  if (payload.quantity !== undefined) {
    normalized.quantity = toDecimalString(
      Math.max(0.0001, toNumber(payload.quantity) ?? 1)
    );
  }
  if (payload.unitPrice !== undefined) {
    normalized.unitPrice = toDecimalString(toNumber(payload.unitPrice) ?? 0);
  }
  if (payload.lineDiscount !== undefined) {
    normalized.lineDiscount = toDecimalString(toNumber(payload.lineDiscount) ?? 0);
  }
  if (payload.taxRateId !== undefined) normalized.taxRateId = payload.taxRateId;
  if (payload.taxAmount !== undefined) {
    normalized.taxAmount = toDecimalString(toNumber(payload.taxAmount) ?? 0);
  }
  if (payload.appliedPromotionId !== undefined) {
    normalized.appliedPromotionId = payload.appliedPromotionId;
  }
  if (payload.courseType !== undefined) normalized.courseType = payload.courseType;
  if (payload.seatNumber !== undefined) normalized.seatNumber = payload.seatNumber;
  if (payload.selectedModifiers !== undefined) {
    normalized.selectedModifiers = payload.selectedModifiers.map((modifier) => ({
      ...modifier,
      priceDelta: toDecimalString(toNumber(modifier.priceDelta) ?? 0),
    }));
  }

  return normalized;
};

const normalizePaymentEntriesAsNumbers = (
  payments: Array<{
    paymentMethodId: string;
    amount: string;
    guestCardId?: string;
    tipAmount?: string;
    transactionReference?: string;
  }>
) =>
  payments.map((payment) => ({
    paymentMethodId: payment.paymentMethodId,
    amount: Math.max(0, toNumber(payment.amount) ?? 0),
    ...(payment.guestCardId?.trim()
      ? { guestCardId: payment.guestCardId.trim() }
      : {}),
    ...(payment.tipAmount !== undefined
      ? { tipAmount: Math.max(0, toNumber(payment.tipAmount) ?? 0) }
      : {}),
    ...(payment.transactionReference
      ? { transactionReference: payment.transactionReference }
      : {}),
  }));

const normalizePaymentEntriesAsDecimals = (
  payments: Array<{
    paymentMethodId: string;
    amount: string;
    guestCardId?: string;
    tipAmount?: string;
    transactionReference?: string;
  }>
) =>
  payments.map((payment) => ({
    paymentMethodId: payment.paymentMethodId,
    amount: toDecimalString(payment.amount),
    ...(payment.guestCardId?.trim()
      ? { guestCardId: payment.guestCardId.trim() }
      : {}),
    ...(payment.tipAmount !== undefined
      ? { tipAmount: toDecimalString(payment.tipAmount) }
      : {}),
    ...(payment.transactionReference
      ? { transactionReference: payment.transactionReference }
      : {}),
  }));

const normalizeTableSessionCheckoutPayload = (
  payload: TableSessionCheckoutDTO
): Record<string, unknown> => ({
  payments: normalizePaymentEntriesAsNumbers(payload.payments),
  ...(payload.tipAmount !== undefined ? { tipAmount: payload.tipAmount } : {}),
  ...(payload.serviceCharge !== undefined
    ? { serviceCharge: payload.serviceCharge }
    : {}),
  ...(payload.discountReasonId
    ? { discountReasonId: payload.discountReasonId }
    : {}),
  ...(payload.totalDiscount !== undefined
    ? { totalDiscount: payload.totalDiscount }
    : {}),
});

const normalizeCheckoutPayload = (
  payload: CheckoutRequestDTO
): Record<string, unknown> => ({
  tenantId: payload.tenantId,
  locationId: payload.locationId,
  salesChannel: payload.salesChannel,
  serviceType: payload.serviceType,
  ...(payload.customerId ? { customerId: payload.customerId } : {}),
  ...(payload.posSessionId ? { posSessionId: payload.posSessionId } : {}),
  ...(payload.lineStatus ? { lineStatus: payload.lineStatus } : {}),
  ...(payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : {}),
  ...(payload.discountReasonId
    ? { discountReasonId: payload.discountReasonId }
    : {}),
  ...(payload.tipAmount !== undefined
    ? { tipAmount: toDecimalString(payload.tipAmount) }
    : {}),
  ...(payload.serviceCharge !== undefined
    ? { serviceCharge: toDecimalString(payload.serviceCharge) }
    : {}),
  items: payload.items.map((item) => ({
    variantId: item.variantId,
    quantity: toDecimalString(Math.max(0.0001, toNumber(item.quantity) ?? 1)),
    lineDiscount: toDecimalString(item.lineDiscount ?? "0"),
  })),
  payments: normalizePaymentEntriesAsDecimals(payload.payments),
});

const toBoolean = (value: unknown): boolean | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return undefined;
};

const toAdjustmentReason = (item: Record<string, unknown>) =>
  new AdjustmentReason({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    code: String(item.code || ""),
    name: String(item.name || ""),
    description: item.description ? String(item.description) : undefined,
    isActive: toBoolean(item.isActive) !== false,
    requiresManagerOverride: Boolean(item.requiresManagerOverride),
  });

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;

const readProductCategory = (
  item: Record<string, unknown>
): { categoryId?: string; categoryName?: string } => {
  const nested =
    asRecord(item.category) ||
    asRecord(item.menuCategory) ||
    asRecord(item.productCategory);
  const categoryId = item.categoryId || nested?.id;
  const categoryName =
    item.categoryName ||
    item.categoryShortName ||
    nested?.shortName ||
    nested?.name ||
    nested?.code;
  return {
    categoryId: categoryId ? String(categoryId) : undefined,
    categoryName: categoryName ? String(categoryName) : undefined,
  };
};

const asList = <T>(response: unknown): T[] => {
  const value = unwrap(response);
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];

  const container = value as Record<string, unknown>;
  const listKeys = [
    "items",
    "results",
    "rows",
    "records",
    "products",
    "variants",
    "orders",
    "lines",
    "payments",
    "methods",
    "zones",
    "tables",
    "sessions",
    "reasons",
    "waitlist",
    "tipPools",
    "allocations",
    "locations",
  ];

  for (const key of listKeys) {
    const candidate = container[key];
    if (Array.isArray(candidate)) return candidate as T[];
    if (candidate && typeof candidate === "object") {
      const nested = asList<T>(candidate);
      if (nested.length) return nested;
    }
  }

  return [];
};

const toTicketLines = (item: Record<string, unknown>) => {
  const candidates = [item.lines, item.items, item.orderLines];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          name: String(row.name || row.productName || row.variantName || "Item"),
          quantity: String(row.quantity || "1"),
          categoryId: row.categoryId ? String(row.categoryId) : undefined,
        };
      });
  }
  return undefined;
};

const toSalesOrder = (item: Record<string, unknown>) =>
  new SalesOrder({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    customerId: item.customerId ? String(item.customerId) : undefined,
    locationId: String(item.locationId || ""),
    orderNumber: String(item.orderNumber || ""),
    businessDate: item.businessDate ? String(item.businessDate) : undefined,
    salesChannel: String(item.salesChannel || "POS"),
    serviceType: fromApiServiceType(String(item.serviceType || "DINE_IN")),
    idempotencyKey: item.idempotencyKey
      ? String(item.idempotencyKey)
      : undefined,
    status: String(item.status || "DRAFT") as SalesOrder["status"],
    subtotal: String(item.subtotal || "0.0000"),
    totalDiscount: String(item.totalDiscount || "0.0000"),
    discountReasonId: item.discountReasonId
      ? String(item.discountReasonId)
      : undefined,
    totalTax: String(item.totalTax || "0.0000"),
    tipAmount: item.tipAmount ? String(item.tipAmount) : undefined,
    serviceCharge: item.serviceCharge
      ? String(item.serviceCharge)
      : undefined,
    grandTotal: String(item.grandTotal || "0.0000"),
    pickupNumber: item.pickupNumber ? String(item.pickupNumber) : undefined,
    pickedUpAt: item.pickedUpAt ? String(item.pickedUpAt) : null,
    createdAt: String(item.createdAt || ""),
    updatedAt: String(item.updatedAt || ""),
  });

const toCounterOrderLine = (value: unknown) => {
  const item = asRecord(value) || {};
  return new SalesOrderLine({
    id: String(item.id || ""),
    salesOrderId: String(item.salesOrderId || ""),
    variantId: String(item.variantId || ""),
    quantity: String(item.quantity || "0.0000"),
    unitPrice: String(item.unitPrice || "0.0000"),
    lineDiscount: String(item.lineDiscount || "0.0000"),
    taxRateId: item.taxRateId ? String(item.taxRateId) : undefined,
    taxAmount: item.taxAmount ? String(item.taxAmount) : undefined,
    appliedPromotionId: item.appliedPromotionId
      ? String(item.appliedPromotionId)
      : undefined,
    status: item.status ? String(item.status) : undefined,
    firedAt: item.firedAt ? String(item.firedAt) : undefined,
    voidedAt: item.voidedAt ? String(item.voidedAt) : undefined,
    voidReasonId: item.voidReasonId ? String(item.voidReasonId) : undefined,
    compReasonId: item.compReasonId ? String(item.compReasonId) : undefined,
    courseType: item.courseType ? String(item.courseType) : undefined,
    selectedModifiers: asRecord(item.selectedModifiers),
    seatNumber: toNumber(item.seatNumber),
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

const toCounterOrderPayment = (value: unknown) => {
  const item = asRecord(value) || {};
  return new OrderPayment({
    id: String(item.id || ""),
    tenantId: item.tenantId ? String(item.tenantId) : undefined,
    salesOrderId: String(item.salesOrderId || ""),
    paymentMethodId: String(item.paymentMethodId || ""),
    posSessionId: item.posSessionId ? String(item.posSessionId) : undefined,
    amount: String(item.amount || "0.0000"),
    tipAmount: item.tipAmount ? String(item.tipAmount) : undefined,
    transactionReference: item.transactionReference
      ? String(item.transactionReference)
      : undefined,
    paymentDate: item.paymentDate ? String(item.paymentDate) : undefined,
    walletLedgerEntryId: item.walletLedgerEntryId
      ? String(item.walletLedgerEntryId)
      : null,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

const toKdsTicket = (item: Record<string, unknown>) =>
  new KdsTicket({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    sessionId: String(item.sessionId || ""),
    salesOrderId: String(item.salesOrderId || ""),
    stationId: String(item.stationId || ""),
    ticketNumber: String(item.ticketNumber || ""),
    courseType: String(item.courseType || ""),
    firedAt: item.firedAt ? String(item.firedAt) : "",
    startedAt: item.startedAt ? String(item.startedAt) : null,
    bumpedAt: item.bumpedAt ? String(item.bumpedAt) : null,
    status: String(item.status || "PENDING") as KdsTicket["status"],
    lines: toTicketLines(item),
    kdsTicketLines: Array.isArray(item.kdsTicketLines)
      ? item.kdsTicketLines.map((value) => {
          const line = asRecord(value) || {};
          return new KdsTicketLine({
            id: String(line.id || ""),
            ticketId: String(line.ticketId || ""),
            salesOrderLineId: String(line.salesOrderLineId || ""),
            productName: String(line.productName || ""),
            quantity: String(line.quantity || "0.0000"),
            seatNumber: toNumber(line.seatNumber),
            kitchenModifiers: line.kitchenModifiers
              ? String(line.kitchenModifiers)
              : undefined,
            status: String(line.status || "PENDING"),
            bumpedAt: line.bumpedAt ? String(line.bumpedAt) : null,
            createdAt: String(line.createdAt || ""),
            updatedAt: String(line.updatedAt || ""),
          });
        })
      : [],
    station: item.station
      ? new KdsStation({
          ...(asRecord(item.station) || {}),
          id: String(asRecord(item.station)?.id || ""),
          tenantId: String(asRecord(item.station)?.tenantId || ""),
          locationId: String(asRecord(item.station)?.locationId || ""),
          name: String(asRecord(item.station)?.name || ""),
        })
      : undefined,
    createdAt: String(item.createdAt || ""),
    updatedAt: String(item.updatedAt || ""),
  });

const toKdsTicketList = (
  response: unknown,
  tickets: KdsTicket[],
  fallbackLimit: number
): KdsTicketListDTO & { tickets: KdsTicket[] } => {
  const envelope =
    response && typeof response === "object"
      ? (response as Record<string, unknown>)
      : {};
  const meta =
    envelope.meta && typeof envelope.meta === "object"
      ? (envelope.meta as Record<string, unknown>)
      : {};
  const limit = Number(meta.limit || fallbackLimit || tickets.length || 1);
  const total = Number(meta.total ?? tickets.length);
  const page = Number(meta.page || 1);
  const totalPages = Number(
    meta.totalPages || Math.max(1, Math.ceil(total / Math.max(limit, 1)))
  );
  return {
    tickets,
    total: Number.isFinite(total) ? total : tickets.length,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? limit : fallbackLimit,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  };
};

const toWaitlistEntry = (item: Record<string, unknown>) =>
  new WaitlistEntry({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    locationId: String(item.locationId || ""),
    customerId: item.customerId ? String(item.customerId) : undefined,
    guestName: String(item.guestName || ""),
    guestPhone: String(item.guestPhone || ""),
    partySize: Number(item.partySize || 0),
    joinedAt: String(item.joinedAt || ""),
    estimatedWaitMins:
      item.estimatedWaitMins !== undefined ? Number(item.estimatedWaitMins) : undefined,
    preferredZoneId: item.preferredZoneId ? String(item.preferredZoneId) : undefined,
    assignedTableId: item.assignedTableId ? String(item.assignedTableId) : undefined,
    tableSessionId: item.tableSessionId ? String(item.tableSessionId) : undefined,
    notifiedAt: item.notifiedAt ? String(item.notifiedAt) : null,
    seatedAt: item.seatedAt ? String(item.seatedAt) : null,
    canceledAt: item.canceledAt ? String(item.canceledAt) : null,
    notes: item.notes ? String(item.notes) : null,
    status: String(item.status || "WAITING") as WaitlistEntry["status"],
  });

const toTipPool = (item: Record<string, unknown>) =>
  new TipPool({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    locationId: String(item.locationId || ""),
    name: String(item.name || ""),
    periodStart: String(item.periodStart || ""),
    periodEnd: String(item.periodEnd || ""),
    distributionMethod: String(item.distributionMethod || ""),
    totalTips: String(item.totalTips || "0.0000"),
    totalServiceCharge: String(item.totalServiceCharge || "0.0000"),
    includeServiceCharge: Boolean(item.includeServiceCharge),
    serviceChargeShareBps: Number(item.serviceChargeShareBps || 0),
    totalDistributable: String(item.totalDistributable || "0.0000"),
    status: String(item.status || "OPEN") as TipPool["status"],
    settledAt: item.settledAt ? String(item.settledAt) : null,
    settledBy: item.settledBy ? String(item.settledBy) : null,
    notes: item.notes ? String(item.notes) : null,
  });

const toTipPoolAllocation = (item: Record<string, unknown>) =>
  new TipPoolAllocation({
    id: String(item.id || ""),
    poolId: String(item.poolId || ""),
    userId: String(item.userId || ""),
    role: String(item.role || ""),
    hoursWorked: String(item.hoursWorked || "0"),
    weight: String(item.weight || "0"),
    amount: String(item.amount || "0"),
    notes: item.notes ? String(item.notes) : null,
  });

const toInventoryLocation = (item: Record<string, unknown>) =>
  new InventoryLocation({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    name: String(item.name || ""),
    type: String(item.type || ""),
    parentLocationId: item.parentLocationId
      ? String(item.parentLocationId)
      : null,
  });

const toPosRegister = (item: Record<string, unknown>) =>
  new PosRegister({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    locationId: String(item.locationId || ""),
    code: String(item.code || ""),
    name: String(item.name || ""),
    macAddress: item.macAddress ? String(item.macAddress) : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });

const toPosSession = (item: Record<string, unknown>) =>
  new PosSession({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    registerId: String(item.registerId || ""),
    cashierId: String(item.cashierId || ""),
    openedAt: item.openedAt ? String(item.openedAt) : undefined,
    closedAt: item.closedAt ? String(item.closedAt) : null,
    openingCashFloat: item.openingCashFloat
      ? String(item.openingCashFloat)
      : undefined,
    expectedClosingCash: item.expectedClosingCash
      ? String(item.expectedClosingCash)
      : undefined,
    actualClosingCash: item.actualClosingCash
      ? String(item.actualClosingCash)
      : undefined,
    cashVariance: item.cashVariance ? String(item.cashVariance) : undefined,
    status: String(item.status || "OPEN") as PosSession["status"],
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });

const flattenInventoryLocations = (
  nodes: unknown[]
): InventoryLocation[] => {
  const results: InventoryLocation[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;

    const item = node as Record<string, unknown>;
    if (item.id) {
      results.push(toInventoryLocation(item));
    }

    for (const childKey of ["subLocations", "children", "locations"]) {
      const children = item[childKey];
      if (Array.isArray(children) && children.length) {
        results.push(...flattenInventoryLocations(children));
      }
    }
  }

  return results;
};

const toPaymentMethod = (item: Record<string, unknown>): PaymentMethod => {
  const kind = item.kind != null && String(item.kind).trim()
    ? String(item.kind)
    : item.code
      ? String(item.code)
      : item.type
        ? String(item.type)
        : undefined;
  return new PaymentMethod({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    name: String(item.name || item.label || ""),
    kind,
    code: kind,
    type: kind,
    isActive: item.isActive === false ? false : true,
    glAccountId: item.glAccountId ? String(item.glAccountId) : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

const nestedId = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const record = asRecord(value);
  return record?.id != null ? String(record.id) : "";
};

const toTableSession = (
  item: Record<string, unknown>,
  fallbackState?: TableSession["sessionState"]
) =>
  new TableSession({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    tableId: nestedId(item.tableId) || nestedId(item.table),
    waiterId: item.waiterId ? String(item.waiterId) : undefined,
    guestCount: Number(item.guestCount || 0),
    openedAt: String(item.openedAt || ""),
    closedAt: item.closedAt ? String(item.closedAt) : null,
    salesOrderId:
      nestedId(item.salesOrderId) ||
      nestedId(item.orderId) ||
      nestedId(item.salesOrder) ||
      nestedId(item.order),
    sessionState: String(
      item.sessionState ||
        fallbackState ||
        (item.closedAt ? "CLOSED" : "SEATED")
    ).toUpperCase() as TableSession["sessionState"],
    posRegisterId: item.posRegisterId ? String(item.posRegisterId) : undefined,
    openedByPosSessionId: item.openedByPosSessionId
      ? String(item.openedByPosSessionId)
      : undefined,
  });

export class ApiCashierRepository implements ICashierRepository {
  constructor(private readonly httpClient: HttpClient) {}

  async getInventoryLocations(): Promise<InventoryLocation[]> {
    const listResponse = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.LOCATIONS.LIST,
      { params: { page: 1, limit: 100 } }
    );
    const listed = flattenInventoryLocations(
      asList<Record<string, unknown>>(listResponse)
    );
    if (listed.length) {
      return listed;
    }

    const treeResponse = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.LOCATIONS.TREE
    );
    const treeValue = unwrap(treeResponse);
    const treeNodes = Array.isArray(treeValue) ? treeValue : [treeValue];
    return flattenInventoryLocations(treeNodes);
  }

  async getProducts(params?: ProductFilterDTO): Promise<Product[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.PRODUCTS.LIST,
      { params }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => {
      const taxRate = asRecord(item.taxRate);
      const category = readProductCategory(item);
      return new Product({
        id: String(item.id || ""),
        tenantId: String(item.tenantId || ""),
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        name: String(item.name || ""),
        basePrice: String(item.basePrice || "0"),
        baseSku: item.baseSku ? String(item.baseSku) : undefined,
        trackingType: item.trackingType ? String(item.trackingType).toUpperCase() : undefined,
        imageUrl: resolveMediaUrl(item.imageUrl),
        totalOnHand: item.totalOnHand ? String(item.totalOnHand) : undefined,
        isTaxable: toBoolean(item.isTaxable),
        taxRate:
          toNumber(item.taxRateRatePercentage) ??
          toNumber(item.taxRatePercentage) ??
          toNumber(item.ratePercentage) ??
          toNumber(taxRate?.ratePercentage) ??
          toNumber(item.taxRate),
        isPriceInclusive:
          toBoolean(item.taxRateIsPriceInclusive) ??
          toBoolean(item.isPriceInclusive) ??
          toBoolean(item.priceInclusive) ??
          toBoolean(taxRate?.isPriceInclusive),
      });
    });
  }

  async getVariants(productId: string): Promise<ProductVariant[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.PRODUCTS.VARIANTS(productId).LIST
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => {
      const taxRate = asRecord(item.taxRate);
      return new ProductVariant({
        id: String(item.id || ""),
        productId: String(item.productId || productId),
        variantSku: item.variantSku ? String(item.variantSku) : undefined,
        barcode: item.barcode ? String(item.barcode) : undefined,
        priceModifier: item.priceModifier ? String(item.priceModifier) : undefined,
        imageUrl: resolveMediaUrl(item.imageUrl),
        matrixOptions:
          item.matrixOptions && typeof item.matrixOptions === "object"
            ? (item.matrixOptions as Record<string, unknown>)
            : undefined,
        isTaxable: toBoolean(item.isTaxable),
        taxRate:
          toNumber(item.taxRateRatePercentage) ??
          toNumber(item.taxRatePercentage) ??
          toNumber(item.ratePercentage) ??
          toNumber(taxRate?.ratePercentage) ??
          toNumber(item.taxRate),
        isPriceInclusive:
          toBoolean(item.taxRateIsPriceInclusive) ??
          toBoolean(item.isPriceInclusive) ??
          toBoolean(item.priceInclusive) ??
          toBoolean(taxRate?.isPriceInclusive),
      });
    });
  }

  async getSalesOrders(params?: SalesOrderFilterDTO): Promise<SalesOrder[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.SALES_ORDERS.LIST,
      { params }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) =>
      new SalesOrder({
        id: String(item.id || ""),
        tenantId: String(item.tenantId || ""),
        customerId: item.customerId ? String(item.customerId) : undefined,
        locationId: String(item.locationId || ""),
        orderNumber: String(item.orderNumber || ""),
        salesChannel: String(item.salesChannel || "POS"),
        serviceType: fromApiServiceType(String(item.serviceType || "DINE_IN")),
        status: String(item.status || "DRAFT") as SalesOrder["status"],
        subtotal: String(item.subtotal || "0"),
        totalDiscount: String(item.totalDiscount || "0"),
        totalTax: String(item.totalTax || "0"),
        grandTotal: String(item.grandTotal || "0"),
        createdAt: String(item.createdAt || ""),
        updatedAt: String(item.updatedAt || ""),
      })
    );
  }

  async getSalesOrderById(id: string): Promise<SalesOrder> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.BY_ID(id)
    );
    const item = unwrap(response);
    return new SalesOrder({
      id: String(item.id || ""),
      tenantId: String(item.tenantId || ""),
      customerId: item.customerId ? String(item.customerId) : undefined,
      locationId: String(item.locationId || ""),
      orderNumber: String(item.orderNumber || ""),
      salesChannel: String(item.salesChannel || "POS"),
      serviceType: fromApiServiceType(String(item.serviceType || "DINE_IN")),
      status: String(item.status || "DRAFT") as SalesOrder["status"],
      subtotal: String(item.subtotal || "0"),
      totalDiscount: String(item.totalDiscount || "0"),
      totalTax: String(item.totalTax || "0"),
      grandTotal: String(item.grandTotal || "0"),
      createdAt: String(item.createdAt || ""),
      updatedAt: String(item.updatedAt || ""),
    });
  }

  async createSalesOrder(payload: CreateSalesOrderDTO): Promise<SalesOrder> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.CREATE,
      {
        tenantId: payload.tenantId,
        locationId: payload.locationId,
        customerId: payload.customerId,
        orderNumber: payload.orderNumber,
        salesChannel: payload.salesChannel,
        idempotencyKey: payload.idempotencyKey,
        subtotal: payload.subtotal,
        totalDiscount: payload.totalDiscount,
        totalTax: payload.totalTax,
        grandTotal: payload.grandTotal,
        status: payload.status,
      }
    );
    const item = unwrap(response);
    return new SalesOrder({
      id: String(item.id || ""),
      tenantId: String(item.tenantId || ""),
      customerId: item.customerId ? String(item.customerId) : undefined,
      locationId: String(item.locationId || ""),
      orderNumber: String(item.orderNumber || ""),
      salesChannel: String(item.salesChannel || "POS"),
      serviceType: item.serviceType
        ? fromApiServiceType(String(item.serviceType))
        : payload.serviceType
          ? fromApiServiceType(toApiServiceType(payload.serviceType))
          : "DINE_IN",
      status: String(item.status || "DRAFT") as SalesOrder["status"],
      subtotal: String(item.subtotal || "0"),
      totalDiscount: String(item.totalDiscount || "0"),
      totalTax: String(item.totalTax || "0"),
      grandTotal: String(item.grandTotal || "0"),
      createdAt: String(item.createdAt || ""),
      updatedAt: String(item.updatedAt || ""),
    });
  }

  async addSalesOrderLine(
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).CREATE,
      normalizeSalesOrderLinePayload(payload)
    );
    const item = unwrap(response);
    return new SalesOrderLine({
      id: String(item.id || ""),
      salesOrderId: String(item.salesOrderId || salesOrderId),
      variantId: String(item.variantId || payload.variantId),
      quantity: String(item.quantity || payload.quantity),
      unitPrice: String(item.unitPrice || payload.unitPrice),
      lineDiscount: item.lineDiscount ? String(item.lineDiscount) : undefined,
      taxAmount: item.taxAmount ? String(item.taxAmount) : undefined,
      status: item.status ? String(item.status) : undefined,
      seatNumber:
        typeof item.seatNumber === "number" ? item.seatNumber : payload.seatNumber,
      createdAt: item.createdAt ? String(item.createdAt) : undefined,
    });
  }

  async updateSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).UPDATE(lineId),
      normalizeSalesOrderPartialLinePayload(payload)
    );
    const item = unwrap(response);
    return new SalesOrderLine({
      id: String(item.id || lineId),
      salesOrderId: String(item.salesOrderId || salesOrderId),
      variantId: String(item.variantId || payload.variantId || ""),
      quantity: String(item.quantity || payload.quantity || "0"),
      unitPrice: String(item.unitPrice || payload.unitPrice || "0"),
      lineDiscount:
        item.lineDiscount !== undefined
          ? String(item.lineDiscount)
          : payload.lineDiscount,
      taxAmount: item.taxAmount ? String(item.taxAmount) : payload.taxAmount,
      status: item.status ? String(item.status) : undefined,
      seatNumber:
        typeof item.seatNumber === "number" ? item.seatNumber : payload.seatNumber,
      createdAt: item.createdAt ? String(item.createdAt) : undefined,
    });
  }

  async deleteSalesOrderLine(salesOrderId: string, lineId: string): Promise<void> {
    await this.httpClient.delete(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).DELETE(lineId)
    );
  }

  async getSalesOrderLines(salesOrderId: string): Promise<SalesOrderLine[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).LIST
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) =>
      new SalesOrderLine({
        id: String(item.id || ""),
        salesOrderId: String(item.salesOrderId || salesOrderId),
        variantId: String(item.variantId || ""),
        quantity: String(item.quantity || "0"),
        unitPrice: String(item.unitPrice || "0"),
        lineDiscount: item.lineDiscount ? String(item.lineDiscount) : undefined,
        taxAmount: item.taxAmount ? String(item.taxAmount) : undefined,
        status: item.status ? String(item.status) : undefined,
        seatNumber: typeof item.seatNumber === "number" ? item.seatNumber : undefined,
        createdAt: item.createdAt ? String(item.createdAt) : undefined,
      })
    );
  }

  async createOrderPayment(
    salesOrderId: string,
    payload: CreateOrderPaymentDTO
  ): Promise<OrderPayment> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.PAYMENTS(salesOrderId).CREATE,
      payload
    );
    const item = unwrap(response);
    return new OrderPayment({
      id: String(item.id || ""),
      salesOrderId: String(item.salesOrderId || salesOrderId),
      paymentMethodId: String(item.paymentMethodId || payload.paymentMethodId),
      amount: String(item.amount || payload.amount),
      tipAmount: item.tipAmount ? String(item.tipAmount) : payload.tipAmount,
      transactionReference: item.transactionReference
        ? String(item.transactionReference)
        : payload.transactionReference,
      paymentDate: item.paymentDate ? String(item.paymentDate) : undefined,
    });
  }

  async getOrderPayments(salesOrderId: string): Promise<OrderPayment[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.SALES_ORDERS.PAYMENTS(salesOrderId).LIST
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) =>
      new OrderPayment({
        id: String(item.id || ""),
        salesOrderId: String(item.salesOrderId || salesOrderId),
        paymentMethodId: String(item.paymentMethodId || ""),
        amount: String(item.amount || "0"),
        tipAmount: item.tipAmount ? String(item.tipAmount) : undefined,
        transactionReference: item.transactionReference
          ? String(item.transactionReference)
          : undefined,
        paymentDate: item.paymentDate ? String(item.paymentDate) : undefined,
      })
    );
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.PAYMENT_METHODS.LIST,
      { params: { page: 1, limit: 100 } }
    );
    return asList<Record<string, unknown>>(response)
      .map((item) => toPaymentMethod(item))
      .filter((method) => method.isActive !== false);
  }

  async getPosRegisters(params?: PosRegisterFilterDTO): Promise<PosRegister[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.POS_REGISTERS.LIST,
      { params: { page: 1, limit: 100, ...params } }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => toPosRegister(item));
  }

  async createPosRegister(payload: CreatePosRegisterDTO): Promise<PosRegister> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.POS_REGISTERS.CREATE,
      payload
    );
    return toPosRegister(unwrap(response));
  }

  async getPosSessions(params?: PosSessionFilterDTO): Promise<PosSession[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.POS_SESSIONS.LIST,
      { params: { page: 1, limit: 200, ...params } }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => toPosSession(item));
  }

  async createPosSession(payload: CreatePosSessionDTO): Promise<PosSession> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.POS_SESSIONS.CREATE,
      payload
    );
    return toPosSession(unwrap(response));
  }

  async closePosSession(sessionId: string): Promise<PosSession> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.POS_SESSIONS.CLOSE(sessionId)
    );
    return toPosSession(unwrap(response));
  }

  async getDiningZones(): Promise<DiningZone[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.DINING_ZONES.LIST,
      { params: { page: 1, limit: 100 } }
    );
    const data = asList<Record<string, unknown>>(response);
    return data
      .map(
        (item) =>
          new DiningZone({
            id: String(item.id || ""),
            tenantId: String(item.tenantId || ""),
            name: String(item.name || ""),
            sortOrder: Number(item.sortOrder || 0),
            layoutSvg: item.layoutSvg ? String(item.layoutSvg) : undefined,
          })
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async getDiningTables(params?: DiningTableFilterDTO): Promise<DiningTable[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.DINING_TABLES.LIST,
      { params }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map(
      (item) =>
        new DiningTable({
          id: String(item.id || ""),
          tenantId: String(item.tenantId || ""),
          zoneId: String(item.zoneId || ""),
          tableNumber: String(item.tableNumber || ""),
          maxSeats: Number(item.maxSeats || 0),
          posX: item.posX ? String(item.posX) : undefined,
          posY: item.posY ? String(item.posY) : undefined,
          shape: item.shape ? String(item.shape) : undefined,
          status: String(item.status || "AVAILABLE")
            .trim()
            .toUpperCase() as DiningTable["status"],
        })
    );
  }

  async updateDiningTableStatus(
    tableId: string,
    status: DiningTable["status"]
  ): Promise<DiningTable> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.DINING_TABLES.UPDATE_STATUS(tableId),
      { status }
    );
    const item = unwrap(response);
    return new DiningTable({
      id: String(item.id || ""),
      tenantId: String(item.tenantId || ""),
      zoneId: String(item.zoneId || ""),
      tableNumber: String(item.tableNumber || ""),
      maxSeats: Number(item.maxSeats || 0),
      posX: item.posX ? String(item.posX) : undefined,
      posY: item.posY ? String(item.posY) : undefined,
      shape: item.shape ? String(item.shape) : undefined,
      status: String(item.status || "AVAILABLE")
        .trim()
        .toUpperCase() as DiningTable["status"],
    });
  }

  async getTableSessions(params?: TableSessionFilterDTO): Promise<TableSession[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.TABLE_SESSIONS.LIST,
      { params }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => toTableSession(item));
  }

  async openTableSession(payload: OpenTableSessionDTO): Promise<TableSession> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TABLE_SESSIONS.CREATE,
      payload
    );
    const item = unwrap(response);
    return toTableSession({
      ...item,
      guestCount: item.guestCount ?? payload.guestCount,
    });
  }

  async updateTableSessionState(
    sessionId: string,
    payload: UpdateTableSessionStateDTO
  ): Promise<TableSession> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TABLE_SESSIONS.STATE(sessionId),
      payload
    );
    const item = unwrap(response);
    return toTableSession(item, payload.sessionState);
  }

  async addTableSessionLine(
    sessionId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TABLE_SESSIONS.LINES(sessionId),
      normalizeUpsertLinePayload(payload)
    );
    const item = unwrap(response);
    return new SalesOrderLine({
      id: String(item.id || ""),
      salesOrderId: String(item.salesOrderId || ""),
      variantId: String(item.variantId || payload.variantId),
      quantity: String(item.quantity || payload.quantity),
      unitPrice: String(item.unitPrice || payload.unitPrice),
      status: item.status ? String(item.status) : undefined,
      seatNumber:
        typeof item.seatNumber === "number" ? item.seatNumber : payload.seatNumber,
    });
  }

  async checkoutTableSession(
    sessionId: string,
    payload: TableSessionCheckoutDTO
  ): Promise<TableSession> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TABLE_SESSIONS.CHECKOUT(sessionId),
      normalizeTableSessionCheckoutPayload(payload)
    );
    const item = unwrap(response);
    return toTableSession(item, "CLOSED");
  }

  async fireToKds(payload: FireKdsDTO): Promise<Record<string, unknown>> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.KDS.FIRE,
      payload
    );
    return unwrap(response);
  }

  async getDiscountReasons(activeOnly: boolean = true): Promise<AdjustmentReason[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.DISCOUNT_REASONS.LIST,
      { params: { page: 1, limit: 100 } }
    );
    const reasons = asList<Record<string, unknown>>(response).map(toAdjustmentReason);
    return activeOnly ? reasons.filter((reason) => reason.isActive) : reasons;
  }

  async getVoidReasons(activeOnly: boolean = true): Promise<AdjustmentReason[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.VOID_REASONS.LIST,
      { params: { page: 1, limit: 100 } }
    );
    const reasons = asList<Record<string, unknown>>(response).map(toAdjustmentReason);
    return activeOnly ? reasons.filter((reason) => reason.isActive) : reasons;
  }

  async getWaitlist(params?: WaitlistFilterDTO): Promise<WaitlistEntry[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.WAITLIST.LIST,
      { params }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => toWaitlistEntry(item));
  }

  async createWaitlistEntry(payload: CreateWaitlistEntryDTO): Promise<WaitlistEntry> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.WAITLIST.CREATE,
      payload
    );
    return toWaitlistEntry(unwrap(response));
  }

  async updateWaitlistEntry(
    id: string,
    payload: UpdateWaitlistEntryDTO
  ): Promise<WaitlistEntry> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.WAITLIST.UPDATE(id),
      payload
    );
    return toWaitlistEntry(unwrap(response));
  }

  async notifyWaitlistEntry(id: string): Promise<WaitlistEntry> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.WAITLIST.NOTIFY(id)
    );
    return toWaitlistEntry(unwrap(response));
  }

  async seatWaitlistEntry(
    id: string,
    payload: SeatWaitlistEntryDTO
  ): Promise<WaitlistEntry> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.WAITLIST.SEAT(id),
      payload
    );
    const data = unwrap(response);
    const nestedReservation =
      data && typeof data.reservation === "object"
        ? (data.reservation as Record<string, unknown>)
        : data;
    return toWaitlistEntry(nestedReservation);
  }

  async cancelWaitlistEntry(id: string): Promise<WaitlistEntry> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.WAITLIST.CANCEL(id)
    );
    return toWaitlistEntry(unwrap(response));
  }

  async noShowWaitlistEntry(id: string): Promise<WaitlistEntry> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.WAITLIST.NO_SHOW(id)
    );
    return toWaitlistEntry(unwrap(response));
  }

  async getTipPools(params?: TipPoolFilterDTO): Promise<TipPool[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.TIP_POOLS.LIST,
      { params }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => toTipPool(item));
  }

  async getTipPoolById(id: string): Promise<TipPool> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.BY_ID(id)
    );
    return toTipPool(unwrap(response));
  }

  async createTipPool(payload: CreateTipPoolDTO): Promise<TipPool> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.CREATE,
      payload
    );
    return toTipPool(unwrap(response));
  }

  async updateTipPool(id: string, payload: UpdateTipPoolDTO): Promise<TipPool> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.UPDATE(id),
      payload
    );
    return toTipPool(unwrap(response));
  }

  async distributeTipPool(id: string): Promise<TipPool> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.DISTRIBUTE(id)
    );
    return toTipPool(unwrap(response));
  }

  async settleTipPool(id: string): Promise<TipPool> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.SETTLE(id)
    );
    return toTipPool(unwrap(response));
  }

  async getTipPoolAllocations(poolId: string): Promise<TipPoolAllocation[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.TIP_POOLS.ALLOCATIONS.LIST(poolId),
      { params: { page: 1, limit: 200 } }
    );
    const data = asList<Record<string, unknown>>(response);
    return data.map((item) => toTipPoolAllocation(item));
  }

  async createTipPoolAllocation(
    poolId: string,
    payload: TipPoolAllocationDTO
  ): Promise<TipPoolAllocation> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.ALLOCATIONS.CREATE(poolId),
      payload
    );
    return toTipPoolAllocation(unwrap(response));
  }

  async updateTipPoolAllocation(
    poolId: string,
    allocationId: string,
    payload: Partial<TipPoolAllocationDTO>
  ): Promise<TipPoolAllocation> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.TIP_POOLS.ALLOCATIONS.UPDATE(poolId, allocationId),
      payload
    );
    return toTipPoolAllocation(unwrap(response));
  }

  async deleteTipPoolAllocation(poolId: string, allocationId: string): Promise<void> {
    await this.httpClient.delete(
      API_ENDPOINTS.TIP_POOLS.ALLOCATIONS.DELETE(poolId, allocationId)
    );
  }

  async listKdsTickets(
    params?: KdsTicketFilterDTO
  ): Promise<KdsTicketListDTO & { tickets: KdsTicket[] }> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.KDS.TICKETS,
      { params }
    );
    const tickets = asList<Record<string, unknown>>(response).map(toKdsTicket);
    return toKdsTicketList(response, tickets, params?.limit || 50);
  }

  async getKdsTicketById(id: string): Promise<KdsTicket> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.KDS.TICKET(id)
    );
    return toKdsTicket(unwrap(response));
  }

  async getCounterOrderById(id: string): Promise<CounterOrderDetail> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.COUNTER_ORDERS.BY_ID(id)
    );
    const payload = unwrap(response);
    const order = asRecord(payload.order) || payload;
    const lines = Array.isArray(payload.salesOrderLines)
      ? payload.salesOrderLines
      : Array.isArray(payload.lines)
        ? payload.lines
        : [];
    const payments = Array.isArray(payload.orderPayments)
      ? payload.orderPayments
      : [];
    const tickets = Array.isArray(payload.kdsTickets)
      ? payload.kdsTickets
      : [];
    return new CounterOrderDetail({
      ...toSalesOrder(order),
      salesOrderLines: lines.map(toCounterOrderLine),
      orderPayments: payments.map(toCounterOrderPayment),
      kdsTickets: tickets.map((ticket) =>
        toKdsTicket(asRecord(ticket) || {})
      ),
    });
  }

  async pickupCounterOrder(id: string): Promise<SalesOrder | null> {
    const response = await this.httpClient.post<
      ApiEnvelope<Record<string, unknown>> | Record<string, unknown> | undefined
    >(API_ENDPOINTS.COUNTER_ORDERS.PICKUP(id));
    const item = asRecord(unwrap(response));
    return item ? toSalesOrder(item) : null;
  }

  async checkout(payload: CheckoutRequestDTO): Promise<Record<string, unknown>> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.CHECKOUT.PROCESS,
      normalizeCheckoutPayload(payload)
    );
    return unwrap(response);
  }

  async voidCheckout(id: string): Promise<VoidCheckoutResultDTO> {
    const response = await this.httpClient.post<
      ApiEnvelope<Record<string, unknown>> | Record<string, unknown>
    >(API_ENDPOINTS.CHECKOUT.VOID(id));
    const item = unwrap(response) as Record<string, unknown>;
    return {
      orderId: String(item.orderId || id),
      ...(item.orderNumber != null
        ? { orderNumber: String(item.orderNumber) }
        : {}),
      ...(item.grandTotal != null ? { grandTotal: String(item.grandTotal) } : {}),
      ...(item.totalPaid != null ? { totalPaid: String(item.totalPaid) } : {}),
      ...(item.change != null ? { change: String(item.change) } : {}),
      ...(item.status != null ? { status: String(item.status) } : {}),
    };
  }
}
