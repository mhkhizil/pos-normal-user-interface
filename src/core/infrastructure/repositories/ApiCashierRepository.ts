import {
  CheckoutRequestDTO,
  CreateOrderPaymentDTO,
  CreateSalesOrderDTO,
  CreateTipPoolDTO,
  CreateWaitlistEntryDTO,
  CreateDiningTableDTO,
  DiningTableFilterDTO,
  DiningTableListDTO,
  FireKdsDTO,
  KdsTicketFilterDTO,
  KdsTicketListDTO,
  OpenTableSessionDTO,
  PosRegisterFilterDTO,
  PosSessionFilterDTO,
  CreateProductDTO,
  CreateProductVariantDTO,
  PaginatedQueryDTO,
  ProductFilterDTO,
  ProductListDTO,
  ProductVariantListDTO,
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
  UomFilterDTO,
  UpdateDiningTableDTO,
  UpdateProductDTO,
  UpdateProductVariantDTO,
  UpdateTableSessionStateDTO,
  TableSeatingChangeDTO,
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
  DiningTableActiveSession,
  DiningZone,
  InventoryLocation,
  KdsTicket,
  KdsTicketLine,
  KdsTicketPlace,
  KdsStation,
  type ModifierGroup,
  OrderPayment,
  PaymentMethod,
  PosRegister,
  PosSession,
  Product,
  ProductVariant,
  TaxRate,
  Uom,
  SalesOrder,
  SalesOrderLine,
  TableSession,
  TipPool,
  TipPoolAllocation,
  WaitlistEntry,
} from "../../domain/entities/Cashier";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS, resolveMediaUrl } from "../api/constants";
import { parseCashier } from "@/lib/printing/cashier";

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
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.hostessId !== undefined ? { hostessId: payload.hostessId } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
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
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.hostessId !== undefined ? { hostessId: payload.hostessId } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
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
  if (payload.hostessId !== undefined) normalized.hostessId = payload.hostessId;
  if (payload.note !== undefined) normalized.note = payload.note;

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
  posSessionId: payload.posSessionId,
  payments: normalizePaymentEntriesAsNumbers(payload.payments),
  ...(payload.includeTax !== undefined ? { includeTax: payload.includeTax } : {}),
  ...(payload.includeServiceCharge !== undefined
    ? { includeServiceCharge: payload.includeServiceCharge }
    : {}),
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
  locationId: payload.locationId,
  salesChannel: payload.salesChannel,
  serviceType: payload.serviceType,
  ...(payload.includeTax !== undefined ? { includeTax: payload.includeTax } : {}),
  ...(payload.includeServiceCharge !== undefined
    ? { includeServiceCharge: payload.includeServiceCharge }
    : {}),
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
    ...(item.unitPrice !== undefined
      ? { unitPrice: toDecimalString(toNumber(item.unitPrice) ?? 0) }
      : {}),
    ...(item.name ? { name: item.name } : {}),
    ...(item.selectedModifiers?.length
      ? {
          selectedModifiers: item.selectedModifiers.map((modifier) => ({
            modifierId: modifier.modifierId,
          })),
        }
      : {}),
    ...(item.hostessId ? { hostessId: item.hostessId } : {}),
    ...(item.note ? { note: item.note } : {}),
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
    "uoms",
    "taxRates",
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

const ticketLineName = (row: Record<string, unknown>) => {
  const salesOrderLine = asRecord(row.salesOrderLine);
  const product =
    asRecord(row.product) || asRecord(salesOrderLine?.product);
  const variant =
    asRecord(row.variant) || asRecord(salesOrderLine?.variant);
  return String(
    row.productName ||
      row.name ||
      product?.name ||
      salesOrderLine?.productName ||
      variant?.name ||
      row.variantName ||
      "Item"
  );
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A value the till can show as a name: not blank, and not a raw id. */
const asName = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text && !UUID_LIKE.test(text) ? text : undefined;
};

const nestedAsName = (value: unknown, keys: string[]): string | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of keys) {
    const name = asName(record[key]);
    if (name) return name;
  }
  return undefined;
};

/**
 * What an order line's item is called, wherever the API puts it: on the line, or
 * on the product and variant it belongs to. Without these names the till has to
 * look the variant up in the menu it happens to have loaded, so a line read back
 * after a refresh shows its SKU, or a slice of its id, instead of the item's name.
 */
const readSalesOrderLineNames = (item: Record<string, unknown>) => {
  const salesOrderLine = asRecord(item.salesOrderLine);
  const product = asRecord(item.product) || asRecord(salesOrderLine?.product);
  const variant = asRecord(item.variant) || asRecord(salesOrderLine?.variant);
  return {
    productName:
      asName(item.productName) ||
      asName(item.name) ||
      nestedAsName(product, ["name", "productName"]) ||
      nestedAsName(variant?.product, ["name"]),
    variantName:
      asName(item.variantName) ||
      nestedAsName(variant, ["name", "variantName", "variantSku"]),
    sku:
      asName(item.sku) ||
      asName(item.variantSku) ||
      nestedAsName(variant, ["variantSku", "sku"]),
  };
};

/** The menu price for one that came with a line: its product's price and its variant's. */
const readLineMenuPrice = (item: Record<string, unknown>) => {
  const variant = asRecord(item.variant);
  const basePrice = asRecord(variant?.product)?.basePrice;
  if (basePrice === undefined || basePrice === null) return undefined;
  return String(Number(basePrice) + Number(variant?.priceModifier ?? 0));
};

/**
 * The modifiers a sold line carries, in whichever shape the API returns them:
 * the array this till posts to add/update a line, or an object keyed by
 * modifier. Both are kept as they come, so a line read back from the server
 * still knows the modifiers it was rung up with.
 */
const readLineModifiers = (
  value: unknown
): Record<string, unknown> | undefined => {
  if (Array.isArray(value)) {
    return value.length ? (value as unknown as Record<string, unknown>) : undefined;
  }
  const record = asRecord(value);
  return record && Object.keys(record).length ? record : undefined;
};

/** The category a sold line was routed by, wherever the API puts it. */
const readLineCategoryId = (row: Record<string, unknown>) => {
  const salesOrderLine = asRecord(row.salesOrderLine);
  const product =
    asRecord(row.product) || asRecord(salesOrderLine?.product);
  const category = asRecord(product?.category) || asRecord(row.category);
  const value =
    row.categoryId ||
    salesOrderLine?.categoryId ||
    product?.categoryId ||
    category?.id;
  return value ? String(value) : undefined;
};

/** The note for the kitchen on a ticket line, as the server sends it with its order line. */
const ticketLineNote = (row: Record<string, unknown>) => {
  const note = asRecord(row.salesOrderLine)?.note;
  return typeof note === "string" && note.trim() ? note.trim() : undefined;
};

/** The KTV lady who ordered a ticket line, as the server sends her with it. */
const ticketLineOrderedBy = (row: Record<string, unknown>) => {
  const hostess = asRecord(asRecord(row.salesOrderLine)?.hostess);
  const name = hostess?.nickname || hostess?.name;
  return name ? String(name) : undefined;
};

const mapTicketLine = (entry: unknown) => {
  const row = asRecord(entry);
  if (!row) return null;
  const modifiers = row.kitchenModifiers
    ? String(row.kitchenModifiers)
    : undefined;
  return {
    name: ticketLineName(row),
    quantity: String(row.quantity || "1"),
    categoryId: readLineCategoryId(row),
    modifiers,
    orderedBy: ticketLineOrderedBy(row),
    note: ticketLineNote(row),
  };
};

const toTicketLines = (item: Record<string, unknown>) => {
  const candidates = [
    item.kdsTicketLines,
    item.lines,
    item.items,
    item.orderLines,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) continue;
    const lines = candidate
      .map(mapTicketLine)
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
    if (lines.length) return lines;
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
    taxInclusive: item.taxInclusive === true,
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

const PLACE_KINDS = ["TABLE", "SPA_ROOM", "KTV_ROOM", "COUNTER"] as const;

const toTicketPlace = (value: unknown): KdsTicketPlace | null => {
  const place = asRecord(value);
  if (!place) return null;
  const kind = PLACE_KINDS.find((item) => item === place.kind) ?? "COUNTER";
  return {
    kind,
    number: place.number ? String(place.number) : null,
    name: place.name ? String(place.name) : null,
    guestCount: toNumber(place.guestCount) ?? null,
  };
};

const toKdsTicket = (item: Record<string, unknown>) => {
  const session = asRecord(item.session);
  return new KdsTicket({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    sessionId: String(item.sessionId || ""),
    salesOrderId: String(item.salesOrderId || session?.salesOrderId || ""),
    stationId: String(item.stationId || ""),
    ticketNumber: String(item.ticketNumber || ""),
    courseType: String(item.courseType || ""),
    firedAt: item.firedAt ? String(item.firedAt) : "",
    startedAt: item.startedAt ? String(item.startedAt) : null,
    bumpedAt: item.bumpedAt ? String(item.bumpedAt) : null,
    status: String(item.status || "PENDING") as KdsTicket["status"],
    place: toTicketPlace(item.place),
    orderNumber: item.orderNumber ? String(item.orderNumber) : null,
    serviceType: item.serviceType ? String(item.serviceType) : null,
    posType: item.posType ? String(item.posType) : null,
    pickupNumber: item.pickupNumber ? String(item.pickupNumber) : null,
    sentBy: parseCashier(item.sentBy),
    sentFrom: item.sentFrom ? String(item.sentFrom) : null,
    deviceName: item.deviceName ? String(item.deviceName) : null,
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
            modifierPrices: line.modifierPrices
              ? String(line.modifierPrices)
              : undefined,
            orderedBy: ticketLineOrderedBy(line),
            note: ticketLineNote(line),
            status: String(line.status || "PENDING"),
            bumpedAt: line.bumpedAt ? String(line.bumpedAt) : null,
            createdAt: String(line.createdAt || ""),
            updatedAt: String(line.updatedAt || ""),
          });
        })
      : [],
    station: item.station
      ? (() => {
          const station = asRecord(item.station) || {};
          return new KdsStation({
            ...station,
            id: String(station.id || item.stationId || ""),
            tenantId: String(station.tenantId || ""),
            locationId: String(station.locationId || ""),
            name: String(station.name || ""),
            printerIds: Array.isArray(station.printerIds)
              ? station.printerIds.map((id) => String(id))
              : station.printerId
                ? [String(station.printerId)]
                : [],
          });
        })()
      : undefined,
    createdAt: String(item.createdAt || ""),
    updatedAt: String(item.updatedAt || ""),
  });
};

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
    joinedTableIds: Array.isArray(item.joinedTables)
      ? item.joinedTables
          .map((joined) => nestedId(asRecord(joined)?.tableId))
          .filter(Boolean)
      : [],
  });

const toDiningTableSession = (value: unknown): DiningTableActiveSession | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!item.id) return null;
  return new DiningTableActiveSession({
    id: String(item.id),
    salesOrderId: String(item.salesOrderId || ""),
    guestCount: Number(item.guestCount || 0),
    sessionState: String(item.sessionState || ""),
    openedAt: String(item.openedAt || ""),
    seatedSeconds: Number(item.seatedSeconds || 0),
    itemCount: Number(item.itemCount || 0),
  });
};

const toDiningTable = (item: Record<string, unknown>) =>
  new DiningTable({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    zoneId: String(item.zoneId || ""),
    tableNumber: String(item.tableNumber || ""),
    maxSeats: Number(item.maxSeats || 0),
    posX: item.posX === null || item.posX === undefined ? undefined : String(item.posX),
    posY: item.posY === null || item.posY === undefined ? undefined : String(item.posY),
    shape: item.shape ? String(item.shape) : undefined,
    status: String(item.status || "AVAILABLE")
      .trim()
      .toUpperCase() as DiningTable["status"],
    deletedAt: item.deletedAt ? String(item.deletedAt) : null,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
    activeSession: toDiningTableSession(item.activeSession),
  });

const readPage = (
  response: unknown,
  count: number,
  params?: { page?: number; limit?: number }
) => {
  const envelope = asRecord(response) || {};
  const meta = asRecord(envelope.meta) || {};
  const inner = asRecord(unwrap(response));
  const limit = Number(meta.limit || inner?.limit || params?.limit || 10);
  const total = Number(meta.total ?? inner?.total ?? count);
  return {
    total,
    page: Number(meta.page || inner?.page || params?.page || 1),
    limit,
    totalPages: Number(
      meta.totalPages || Math.max(1, Math.ceil(total / Math.max(limit, 1)))
    ),
  };
};

const assignText = (body: Record<string, unknown>, key: string, value?: string) => {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  body[key] = trimmed;
};

const toProductPayload = (
  payload: CreateProductDTO | UpdateProductDTO,
  withTenant: boolean
) => {
  const body: Record<string, unknown> = {};
  if (withTenant && "tenantId" in payload) {
    assignText(body, "tenantId", payload.tenantId);
  }
  assignText(body, "name", payload.name);
  assignText(body, "baseSku", payload.baseSku);
  if (payload.basePrice !== undefined && payload.basePrice.trim()) {
    body.basePrice = toDecimalString(payload.basePrice);
  }
  assignText(body, "baseUomId", payload.baseUomId);
  assignText(body, "categoryId", payload.categoryId);
  if (payload.globalAttributes) body.globalAttributes = payload.globalAttributes;
  assignText(body, "imageUrl", payload.imageUrl);
  assignText(body, "trackingType", payload.trackingType);
  if (payload.isAvailable !== undefined) body.isAvailable = payload.isAvailable;
  if (payload.isTaxable !== undefined) body.isTaxable = payload.isTaxable;
  assignText(body, "taxRateId", payload.taxRateId);
  return body;
};

const toVariantPayload = (payload: CreateProductVariantDTO | UpdateProductVariantDTO) => {
  const body: Record<string, unknown> = {};
  assignText(body, "variantSku", payload.variantSku);
  if (payload.matrixOptions) body.matrixOptions = payload.matrixOptions;
  assignText(body, "barcode", payload.barcode);
  if (payload.priceModifier !== undefined && payload.priceModifier.trim()) {
    body.priceModifier = toDecimalString(payload.priceModifier);
  }
  assignText(body, "imageUrl", payload.imageUrl);
  return body;
};

/**
 * A product's own taxes as one rate. They are all inside the price or all on
 * top, so the fractions add up; the first says which.
 */
const ownTaxes = (item: Record<string, unknown>) => {
  const rates = Array.isArray(item.taxRates)
    ? (item.taxRates as unknown[])
        .map(asRecord)
        .filter((rate): rate is Record<string, unknown> => Boolean(rate?.id))
    : [];
  if (!rates.length) return null;
  return {
    ids: rates.map((rate) => String(rate.id)),
    rate: rates.reduce((sum, rate) => sum + (toNumber(rate.ratePercentage) ?? 0), 0),
    isPriceInclusive: rates[0].isPriceInclusive === true,
  };
};

const toModifierGroups = (value: unknown): ModifierGroup[] =>
  Array.isArray(value)
    ? value.map(asRecord).flatMap((group) =>
        group?.id
          ? [
              {
                id: String(group.id),
                name: String(group.name || ""),
                minSelection: toNumber(group.minSelection) ?? 0,
                maxSelection: toNumber(group.maxSelection) ?? null,
                isRequired: toBoolean(group.isRequired) ?? false,
                modifiers: (Array.isArray(group.modifiers) ? group.modifiers : [])
                  .map(asRecord)
                  .flatMap((option) =>
                    option?.id
                      ? [
                          {
                            id: String(option.id),
                            name: String(option.name || ""),
                            priceDelta: String(option.priceDelta ?? "0"),
                            isDefault: toBoolean(option.isDefault) ?? false,
                          },
                        ]
                      : []
                  ),
              },
            ]
          : []
      )
    : [];

const toProduct = (item: Record<string, unknown>) => {
  const taxRate = asRecord(item.taxRate);
  const own = ownTaxes(item);
  const category = readProductCategory(item);
  const rawImage = item.imageUrl ? String(item.imageUrl) : undefined;
  return new Product({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    name: String(item.name || ""),
    basePrice: String(item.basePrice || "0"),
    baseSku: item.baseSku ? String(item.baseSku) : undefined,
    baseUomId: item.baseUomId ? String(item.baseUomId) : undefined,
    trackingType: item.trackingType ? String(item.trackingType).toUpperCase() : undefined,
    imageUrl: resolveMediaUrl(item.imageUrl),
    sourceImageUrl: rawImage,
    globalAttributes: asRecord(item.globalAttributes),
    totalOnHand:
      item.totalOnHand === null || item.totalOnHand === undefined
        ? undefined
        : String(item.totalOnHand),
    isAvailable: toBoolean(item.isAvailable) ?? true,
    isTaxable: toBoolean(item.isTaxable),
    taxRateIds: own?.ids ?? [],
    taxRateId: own
      ? own.ids[0]
      : item.taxRateId
        ? String(item.taxRateId)
        : taxRate?.id
          ? String(taxRate.id)
          : undefined,
    taxRate:
      own?.rate ??
      toNumber(item.taxRateRatePercentage) ??
      toNumber(item.taxRatePercentage) ??
      toNumber(item.ratePercentage) ??
      toNumber(taxRate?.ratePercentage) ??
      toNumber(item.taxRate),
    isPriceInclusive:
      own?.isPriceInclusive ??
      toBoolean(item.taxRateIsPriceInclusive) ??
      toBoolean(item.isPriceInclusive) ??
      toBoolean(item.priceInclusive) ??
      toBoolean(taxRate?.isPriceInclusive),
    kind:
      item.kind === "SERVICE" || item.kind === "RENTAL" ? item.kind : "ITEM",
    soldAt: Array.isArray(item.soldAt)
      ? (item.soldAt as unknown[]).filter(
          (area): area is "BAR" | "SPA" | "KTV" =>
            area === "BAR" || area === "SPA" || area === "KTV"
        )
      : [],
    soldBy: item.soldBy === "TIME" ? "TIME" : "EACH",
    timeBlockMinutes: toNumber(item.timeBlockMinutes) ?? null,
    minimumBlocks: toNumber(item.minimumBlocks) ?? null,
    askWhoServed: toBoolean(item.askWhoServed) ?? false,
    chargeMode: item.chargeMode === "CLOCK" ? "CLOCK" : item.chargeMode === "PAY_FIRST" ? "PAY_FIRST" : null,
    // Kept undefined when the payload leaves them out, so the till can tell "none
    // attached" from "this list did not say", and read the product when it must.
    modifierGroups: Array.isArray(item.modifierGroups)
      ? toModifierGroups(item.modifierGroups)
      : undefined,
    autoApply: toBoolean(item.autoApply) ?? false,
    deletedAt: item.deletedAt ? String(item.deletedAt) : item.deletedAt === null ? null : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

const toVariant = (item: Record<string, unknown>, productId: string) => {
  const taxRate = asRecord(item.taxRate);
  const rawImage = item.imageUrl ? String(item.imageUrl) : undefined;
  return new ProductVariant({
    id: String(item.id || ""),
    productId: String(item.productId || productId),
    variantSku: item.variantSku ? String(item.variantSku) : undefined,
    barcode: item.barcode ? String(item.barcode) : undefined,
    priceModifier: item.priceModifier ? String(item.priceModifier) : undefined,
    imageUrl: resolveMediaUrl(item.imageUrl),
    sourceImageUrl: rawImage,
    matrixOptions: asRecord(item.matrixOptions),
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
    deletedAt: item.deletedAt ? String(item.deletedAt) : item.deletedAt === null ? null : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

const toUom = (item: Record<string, unknown>) =>
  new Uom({
    id: String(item.id || ""),
    classId: String(item.classId || ""),
    name: String(item.name || ""),
    abbreviation: String(item.abbreviation || ""),
    conversionRateToBase: String(item.conversionRateToBase || "1"),
  });

const toTaxRate = (item: Record<string, unknown>) =>
  new TaxRate({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    name: String(item.name || ""),
    ratePercentage: String(item.ratePercentage || "0"),
    isPriceInclusive: toBoolean(item.isPriceInclusive),
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
    const listed = await this.listProducts(params);
    return listed.products;
  }

  async listProducts(params?: ProductFilterDTO): Promise<ProductListDTO> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.PRODUCTS.LIST,
      { params }
    );
    const products = asList<Record<string, unknown>>(response).map(toProduct);
    return { products, ...readPage(response, products.length, params) };
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.BY_ID(id)
    );
    return toProduct(unwrap(response));
  }

  async createProduct(payload: CreateProductDTO): Promise<Product> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.CREATE,
      toProductPayload(payload, true)
    );
    return toProduct(unwrap(response));
  }

  async updateProduct(id: string, payload: UpdateProductDTO): Promise<Product> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.UPDATE(id),
      toProductPayload(payload, false)
    );
    return toProduct(unwrap(response));
  }

  async deleteProduct(id: string): Promise<Product> {
    const response = await this.httpClient.delete<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.DELETE(id)
    );
    return toProduct(unwrap(response));
  }

  async getVariants(productId: string): Promise<ProductVariant[]> {
    const listed = await this.listVariants(productId);
    return listed.variants;
  }

  async listVariants(
    productId: string,
    params?: PaginatedQueryDTO
  ): Promise<ProductVariantListDTO> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.PRODUCTS.VARIANTS(productId).LIST,
      { params }
    );
    const variants = asList<Record<string, unknown>>(response).map((item) =>
      toVariant(item, productId)
    );
    return { variants, ...readPage(response, variants.length, params) };
  }

  async getVariant(productId: string, id: string): Promise<ProductVariant> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.VARIANTS(productId).BY_ID(id)
    );
    return toVariant(unwrap(response), productId);
  }

  async createVariant(
    productId: string,
    payload: CreateProductVariantDTO
  ): Promise<ProductVariant> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.VARIANTS(productId).CREATE,
      toVariantPayload(payload)
    );
    return toVariant(unwrap(response), productId);
  }

  async updateVariant(
    productId: string,
    id: string,
    payload: UpdateProductVariantDTO
  ): Promise<ProductVariant> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.VARIANTS(productId).UPDATE(id),
      toVariantPayload(payload)
    );
    return toVariant(unwrap(response), productId);
  }

  async deleteVariant(productId: string, id: string): Promise<ProductVariant> {
    const response = await this.httpClient.delete<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.PRODUCTS.VARIANTS(productId).DELETE(id)
    );
    return toVariant(unwrap(response), productId);
  }

  async listUoms(params?: UomFilterDTO): Promise<Uom[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.UOMS.LIST,
      { params }
    );
    return asList<Record<string, unknown>>(response).map(toUom);
  }

  async listTaxRates(params?: PaginatedQueryDTO): Promise<TaxRate[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.TAX_RATES.LIST,
      { params }
    );
    return asList<Record<string, unknown>>(response).map(toTaxRate);
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
        serviceType: payload.serviceType
          ? toApiServiceType(payload.serviceType)
          : undefined,
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
      taxInclusive: item.taxInclusive === true,
      status: item.status ? String(item.status) : undefined,
      firedAt: item.firedAt ? String(item.firedAt) : undefined,
      voidedAt: item.voidedAt ? String(item.voidedAt) : undefined,
      seatNumber:
        typeof item.seatNumber === "number" ? item.seatNumber : payload.seatNumber,
      createdAt: item.createdAt ? String(item.createdAt) : undefined,
      categoryId: readLineCategoryId(item),
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
      firedAt: item.firedAt ? String(item.firedAt) : undefined,
      voidedAt: item.voidedAt ? String(item.voidedAt) : undefined,
      seatNumber:
        typeof item.seatNumber === "number" ? item.seatNumber : payload.seatNumber,
      createdAt: item.createdAt ? String(item.createdAt) : undefined,
      categoryId: readLineCategoryId(item),
    });
  }

  async splitSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    quantity: string
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).SPLIT(lineId),
      { quantity }
    );
    const item = unwrap(response);
    return new SalesOrderLine({
      id: String(item.id),
      salesOrderId: String(item.salesOrderId || salesOrderId),
      variantId: String(item.variantId || ""),
      quantity: String(item.quantity || quantity),
      unitPrice: String(item.unitPrice || "0"),
      lineDiscount: item.lineDiscount !== undefined ? String(item.lineDiscount) : undefined,
      taxAmount: item.taxAmount ? String(item.taxAmount) : undefined,
      status: item.status ? String(item.status) : undefined,
      firedAt: item.firedAt ? String(item.firedAt) : undefined,
      seatNumber: typeof item.seatNumber === "number" ? item.seatNumber : undefined,
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
    return data.map((item) => {
      const names = readSalesOrderLineNames(item);
      return new SalesOrderLine({
        id: String(item.id || ""),
        salesOrderId: String(item.salesOrderId || salesOrderId),
        variantId: String(item.variantId || ""),
        quantity: String(item.quantity || "0"),
        unitPrice: String(item.unitPrice || "0"),
        lineDiscount: item.lineDiscount ? String(item.lineDiscount) : undefined,
        taxRateId: item.taxRateId ? String(item.taxRateId) : undefined,
        taxAmount: item.taxAmount ? String(item.taxAmount) : undefined,
        taxInclusive: item.taxInclusive === true,
        appliedPromotionId: item.appliedPromotionId
          ? String(item.appliedPromotionId)
          : undefined,
        status: item.status ? String(item.status) : undefined,
        firedAt: item.firedAt ? String(item.firedAt) : undefined,
        voidedAt: item.voidedAt ? String(item.voidedAt) : undefined,
        voidReasonId: item.voidReasonId ? String(item.voidReasonId) : undefined,
        compReasonId: item.compReasonId ? String(item.compReasonId) : undefined,
        courseType: item.courseType ? String(item.courseType) : undefined,
        selectedModifiers: readLineModifiers(item.selectedModifiers),
        seatNumber: typeof item.seatNumber === "number" ? item.seatNumber : undefined,
        createdAt: item.createdAt ? String(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
        categoryId: readLineCategoryId(item),
        categoryName: asName(item.categoryName) || asName(asRecord(item.product)?.categoryName),
        menuPrice: readLineMenuPrice(item),
        hostessId: item.hostessId ? String(item.hostessId) : undefined,
        note: item.note ? String(item.note) : undefined,
        ...names,
      });
    });
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
        posSessionId: item.posSessionId ? String(item.posSessionId) : undefined,
        walletLedgerEntryId: item.walletLedgerEntryId ? String(item.walletLedgerEntryId) : null,
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
    const listed = await this.listDiningTables(params);
    return listed.tables;
  }

  async listDiningTables(params?: DiningTableFilterDTO): Promise<DiningTableListDTO> {
    const response = await this.httpClient.get<
      ApiEnvelope<Record<string, unknown>[]> & { meta?: Record<string, unknown> }
    >(API_ENDPOINTS.DINING_TABLES.LIST, { params });
    const tables = asList<Record<string, unknown>>(response).map(toDiningTable);
    const meta = response.meta || {};
    const limit = Number(meta.limit || params?.limit || 10);
    const total = Number(meta.total ?? tables.length);
    return {
      tables,
      total,
      page: Number(meta.page || params?.page || 1),
      limit,
      totalPages: Number(
        meta.totalPages || Math.max(1, Math.ceil(total / Math.max(limit, 1)))
      ),
    };
  }

  async getDiningTable(tableId: string): Promise<DiningTable> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.DINING_TABLES.BY_ID(tableId)
    );
    return toDiningTable(unwrap(response));
  }

  async createDiningTable(payload: CreateDiningTableDTO): Promise<DiningTable> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.DINING_TABLES.CREATE,
      payload
    );
    return toDiningTable(unwrap(response));
  }

  async updateDiningTable(
    tableId: string,
    payload: UpdateDiningTableDTO
  ): Promise<DiningTable> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.DINING_TABLES.UPDATE(tableId),
      payload
    );
    return toDiningTable(unwrap(response));
  }

  async deleteDiningTable(tableId: string): Promise<DiningTable> {
    const response = await this.httpClient.delete<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.DINING_TABLES.DELETE(tableId)
    );
    return toDiningTable(unwrap(response));
  }

  async updateDiningTableStatus(
    tableId: string,
    status: DiningTable["status"]
  ): Promise<DiningTable> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.DINING_TABLES.UPDATE_STATUS(tableId),
      { status }
    );
    return toDiningTable(unwrap(response));
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

  async changeTableSeating(
    sessionId: string,
    change: TableSeatingChangeDTO
  ): Promise<TableSession> {
    const endpoints = API_ENDPOINTS.TABLE_SESSIONS;
    const response =
      change.kind === "move"
        ? await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
            endpoints.MOVE(sessionId),
            { tableId: change.tableId }
          )
        : change.kind === "merge"
          ? await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
              endpoints.MERGE(sessionId),
              {
                sourceSessionId: change.sourceSessionId,
                keepTable: change.keepTable,
              }
            )
          : change.kind === "split"
            ? await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
                endpoints.SPLIT(sessionId),
                { targetSessionId: change.targetSessionId, lines: change.lines }
              )
            : change.kind === "join"
              ? await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
                  endpoints.TABLES(sessionId),
                  { tableId: change.tableId }
                )
              : await this.httpClient.delete<ApiEnvelope<Record<string, unknown>>>(
                  endpoints.TABLE(sessionId, change.tableId)
                );
    return toTableSession(unwrap(response));
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
      categoryId: readLineCategoryId(item),
      note: item.note ? String(item.note) : payload.note || undefined,
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

  async startKdsTicket(id: string): Promise<KdsTicket> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.KDS.START(id)
    );
    return toKdsTicket(unwrap(response));
  }

  async readyKdsTicket(id: string): Promise<KdsTicket> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.KDS.READY(id)
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

  async voidCheckout(id: string, approverToken?: string): Promise<VoidCheckoutResultDTO> {
    const response = await this.httpClient.post<
      ApiEnvelope<Record<string, unknown>> | Record<string, unknown>
    >(
      API_ENDPOINTS.CHECKOUT.VOID(id),
      undefined,
      approverToken ? { headers: { "x-approver-authorization": approverToken } } : undefined
    );
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
