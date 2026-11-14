import {
  CompSalesOrderLineDTO,
  CreateSalesOrderDTO,
  SalesOrderBillDTO,
  SalesOrderBillQueryDTO,
  SalesOrderFilterDTO,
  SalesOrderLineListResponseDTO,
  SalesOrderListResponseDTO,
  UpdateSalesOrderDTO,
  UpdateSalesOrderLineDTO,
  UpsertSalesOrderLineDTO,
  SettleSalesOrderDTO,
  SettleSalesOrderResultDTO,
  VoidSalesOrderLineDTO,
  EditSalesOrderDTO,
  EditSalesOrderPreviewDTO,
  EditSalesOrderPreviewResultDTO,
  EditSalesOrderResultDTO,
  SalesOrderEditDTO,
} from "../../application/dtos/SalesOrderDTO";
import { fromApiServiceType } from "../../application/dtos/CashierDTO";
import { ISalesOrderRepository } from "../../domain/repositories/ISalesOrderRepository";
import { SalesOrder, SalesOrderLine, SalesOrderPlace } from "../../domain/entities/Cashier";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";
import { parseCashier } from "@/lib/printing/cashier";
import { variantOptionsName } from "@/lib/pos/orderListDisplay";

/**
 * An order's lines are read whole. The lines endpoint pages at 10 when a request
 * names no limit, so a call without page/limit must still ask for every line.
 */
const ORDER_LINES_LIMIT = 200;

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
  data?: T;
}

const unwrap = <T>(response: ApiEnvelope<T> | T): T => {
  if (response && typeof response === "object" && "data" in response) {
    return unwrap((response as ApiEnvelope<T>).data as T);
  }
  return response as T;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asList = <T>(response: unknown): T[] => {
  const value = unwrap(response as never);
  if (Array.isArray(value)) return value as T[];
  const container = asRecord(value);
  if (!container) return [];
  if (Array.isArray(container.data)) return container.data as T[];
  if (Array.isArray(container.items)) return container.items as T[];
  return [];
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

const toMeta = (response: unknown, fallbackLimit: number, count: number) => {
  const envelope = asRecord(response);
  const meta = asRecord(envelope?.meta);
  const page = Number(meta?.page || 1);
  const limit = Number(meta?.limit || fallbackLimit);
  const total = Number(meta?.total ?? count);
  const totalPages = Number(
    meta?.totalPages || Math.max(1, Math.ceil((total || 1) / (limit || 1)))
  );
  return { page, limit, total, totalPages };
};

const asText = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asHumanName = (value: unknown): string | undefined => {
  const text = asText(value);
  if (!text || UUID_LIKE.test(text)) return undefined;
  return text;
};

const nestedName = (value: unknown, keys: string[]): string | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of keys) {
    const text = asHumanName(record[key]);
    if (text) return text;
  }
  return undefined;
};

const nestedList = (item: Record<string, unknown>): Record<string, unknown>[] => {
  const candidates = [item.lines, item.items, item.orderLines];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      );
    }
  }
  return [];
};

const resolveCustomerName = (item: Record<string, unknown>): string | undefined =>
  asHumanName(item.customerName) ||
  asHumanName(item.guestName) ||
  nestedName(item.customer, ["fullName", "name", "displayName", "guestName"]) ||
  nestedName(item.guest, ["fullName", "name", "guestName"]);

const resolveLineCatalog = (item: Record<string, unknown>) => {
  const product = asRecord(item.product);
  const variant = asRecord(item.variant);
  return {
    productName:
      asHumanName(item.productName) ||
      asHumanName(item.name) ||
      nestedName(product, ["name", "productName"]) ||
      nestedName(variant?.product, ["name"]),
    variantName:
      asHumanName(item.variantName) ||
      variantOptionsName({
        variantName: nestedName(variant, ["name", "variantName"]),
        matrixOptions:
          asRecord(variant?.matrixOptions) || asRecord(item.matrixOptions),
      }) ||
      undefined,
    sku:
      asHumanName(item.sku) ||
      asHumanName(item.variantSku) ||
      nestedName(variant, ["variantSku", "sku"]),
  };
};

const nestedLineCount = (item: Record<string, unknown>): number | undefined => {
  const countBlock = asRecord(item._count);
  const fromCount = toNumber(
    countBlock?.lines ??
      countBlock?.orderLines ??
      countBlock?.salesOrderLines
  );
  if (fromCount !== undefined) return fromCount;
  return toNumber(
    item.linesCount ??
      item.lineItemsCount ??
      item.totalLineItems ??
      item.totalLines
  );
};

const quantityFromLines = (lines: Record<string, unknown>[]): number | undefined => {
  if (!lines.length) return undefined;
  let total = 0;
  let hasQuantity = false;
  for (const line of lines) {
    const quantity = toNumber(line.quantity);
    if (quantity === undefined) continue;
    hasQuantity = true;
    total += quantity;
  }
  if (hasQuantity && total > 0) return Math.round(total * 10000) / 10000;
  return lines.length;
};

const resolveItemSummary = (item: Record<string, unknown>) => {
  const lines = nestedList(item);
  const names = lines
    .map((line) => {
      const catalog = resolveLineCatalog(line);
      return catalog.productName || catalog.variantName || catalog.sku;
    })
    .filter((name): name is string => Boolean(name));
  const fromLines = quantityFromLines(lines);
  let itemCount: number | undefined;
  if (fromLines !== undefined) {
    itemCount = fromLines;
  } else {
    const explicit = toNumber(
      item.itemCount ?? item.lineCount ?? item.itemsCount
    );
    const nested = nestedLineCount(item);
    if (explicit !== undefined && explicit > 0) itemCount = explicit;
    else if (nested !== undefined && nested > 0) itemCount = nested;
    else if (explicit !== undefined) itemCount = explicit;
    else itemCount = nested;
  }
  let itemSummary = asHumanName(item.itemSummary);
  if (!itemSummary && names.length) {
    itemSummary =
      names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1}`;
  }
  return { itemCount, itemSummary };
};

const PLACE_KINDS = ["TABLE", "KTV", "SPA"] as const;

const toPlace = (value: unknown): SalesOrderPlace | null => {
  const place = asRecord(value);
  const kind = PLACE_KINDS.find((item) => item === place?.kind);
  if (!place || !kind || !place.number || !place.openedAt) return null;
  return {
    kind,
    number: String(place.number),
    openedAt: String(place.openedAt),
    closedAt: place.closedAt ? String(place.closedAt) : null,
    manualInAt: place.manualInAt ? String(place.manualInAt) : null,
    manualOutAt: place.manualOutAt ? String(place.manualOutAt) : null,
  };
};

const readLineMenuPrice = (item: Record<string, unknown>) => {
  const variant = asRecord(item.variant);
  const basePrice = asRecord(variant?.product)?.basePrice;
  if (basePrice === undefined || basePrice === null) return undefined;
  return String(Number(basePrice) + Number(variant?.priceModifier ?? 0));
};

const toSalesOrder = (item: Record<string, unknown>): SalesOrder => {
  const catalog = resolveItemSummary(item);
  return new SalesOrder({
    id: String(item.id || ""),
    tenantId: String(item.tenantId || ""),
    customerId: item.customerId ? String(item.customerId) : undefined,
    locationId: String(item.locationId || ""),
    orderNumber: String(item.orderNumber || ""),
    businessDate: item.businessDate ? String(item.businessDate) : undefined,
    salesChannel: String(item.salesChannel || "POS"),
    serviceType: fromApiServiceType(String(item.serviceType || "DINE_IN")),
    idempotencyKey: item.idempotencyKey ? String(item.idempotencyKey) : undefined,
    status: String(item.status || "DRAFT") as SalesOrder["status"],
    subtotal: String(item.subtotal || "0.0000"),
    totalDiscount: String(item.totalDiscount || "0.0000"),
    totalTax: String(item.totalTax || "0.0000"),
    tipAmount: item.tipAmount ? String(item.tipAmount) : undefined,
    serviceCharge: item.serviceCharge ? String(item.serviceCharge) : undefined,
    grandTotal: String(item.grandTotal || "0.0000"),
    pickupNumber: item.pickupNumber ? String(item.pickupNumber) : undefined,
    pickedUpAt:
      item.pickedUpAt === null
        ? null
        : item.pickedUpAt
          ? String(item.pickedUpAt)
          : undefined,
    discountReasonId: item.discountReasonId
      ? String(item.discountReasonId)
      : undefined,
    customerName: resolveCustomerName(item),
    cashier: parseCashier(item.cashier),
    locationName: nestedName(item.location, ["name"]),
    place: toPlace(item.place),
    payments: Array.isArray(item.orderPayments)
      ? item.orderPayments.flatMap((value) => {
          const payment = asRecord(value);
          if (!payment) return [];
          return [
            {
              methodName: nestedName(payment.paymentMethod, ["name"]) || "Payment",
              methodKind: asText(asRecord(payment.paymentMethod)?.kind),
              amount: toDecimalString(payment.amount),
              paidAt: asText(payment.paymentDate),
            },
          ];
        })
      : undefined,
    itemCount: catalog.itemCount,
    itemSummary: catalog.itemSummary,
    createdAt: String(item.createdAt || ""),
    updatedAt: String(item.updatedAt || ""),
  });
};

const lineCategoryName = (item: Record<string, unknown>) => {
  const product = asRecord(item.product);
  const nested =
    asRecord(item.category) ||
    asRecord(product?.category) ||
    asRecord(product?.menuCategory);
  const name =
    asHumanName(item.categoryName) ||
    asHumanName(product?.categoryName) ||
    nestedName(nested, ["name", "shortName", "code"]);
  return name;
};

const toSalesOrderLine = (
  item: Record<string, unknown>,
  salesOrderId?: string
): SalesOrderLine => {
  const catalog = resolveLineCatalog(item);
  return new SalesOrderLine({
    id: String(item.id || ""),
    salesOrderId: String(item.salesOrderId || salesOrderId || ""),
    variantId: String(item.variantId || ""),
    quantity: String(item.quantity || "0.0000"),
    unitPrice: String(item.unitPrice || "0.0000"),
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
    selectedModifiers:
      item.selectedModifiers && typeof item.selectedModifiers === "object"
        ? (item.selectedModifiers as Record<string, unknown>)
        : undefined,
    seatNumber: typeof item.seatNumber === "number" ? item.seatNumber : undefined,
    hostessId: item.hostessId ? String(item.hostessId) : undefined,
        note: item.note ? String(item.note) : undefined,
    askWhoServed: asRecord(asRecord(item.variant)?.product)?.askWhoServed === true,
    promotionNames: Array.isArray(item.promotions)
      ? item.promotions.flatMap((value) => {
          const name = asText(asRecord(value)?.name);
          return name ? [name] : [];
        })
      : undefined,
    menuPrice: readLineMenuPrice(item),
    productName: catalog.productName,
    variantName: catalog.variantName,
    sku: catalog.sku,
    categoryName: lineCategoryName(item),
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
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
    quantity: toDecimalString(quantity),
    unitPrice: toDecimalString(unitPrice),
    lineDiscount: toDecimalString(lineDiscount),
    taxRateId: payload.taxRateId,
    ...(taxAmount !== undefined ? { taxAmount: toDecimalString(taxAmount) } : {}),
    appliedPromotionId: payload.appliedPromotionId,
    courseType: payload.courseType,
    seatNumber: payload.seatNumber,
    selectedModifiers: payload.selectedModifiers?.map((modifier) => ({
      ...modifier,
      priceDelta: toDecimalString(toNumber(modifier.priceDelta) ?? 0),
    })),
    ...(payload.hostessId !== undefined ? { hostessId: payload.hostessId } : {}),
    ...(payload.note ? { note: payload.note } : {}),
  };
};

const normalizePartialLinePayload = (
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
  if (payload.hostessId !== undefined) normalized.hostessId = payload.hostessId;
  if (payload.note !== undefined) normalized.note = payload.note;
  if (payload.selectedModifiers !== undefined) {
    normalized.selectedModifiers = payload.selectedModifiers.map((modifier) => ({
      ...modifier,
      priceDelta: toDecimalString(toNumber(modifier.priceDelta) ?? 0),
    }));
  }
  return normalized;
};

export class ApiSalesOrderRepository implements ISalesOrderRepository {
  constructor(private readonly httpClient: HttpClient) {}

  async getSalesOrders(
    params?: SalesOrderFilterDTO
  ): Promise<SalesOrderListResponseDTO> {
    const response = await this.httpClient.get<
      ApiEnvelope<Record<string, unknown>[]>
    >(API_ENDPOINTS.SALES_ORDERS.LIST, { params });
    const data = asList<Record<string, unknown>>(response);
    const meta = toMeta(response, params?.limit || 10, data.length);
    return {
      orders: data.map(toSalesOrder),
      ...meta,
    };
  }

  async getSalesOrderById(id: string): Promise<SalesOrder> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.BY_ID(id)
    );
    return toSalesOrder(asRecord(unwrap(response)) || {});
  }

  async createSalesOrder(payload: CreateSalesOrderDTO): Promise<SalesOrder> {
    const { serviceType: _serviceType, ...body } = payload;
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.CREATE,
      body
    );
    return toSalesOrder(asRecord(unwrap(response)) || {});
  }

  async getSalesOrderBill(
    id: string,
    query?: SalesOrderBillQueryDTO
  ): Promise<SalesOrderBillDTO> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.BILL(id),
      { params: query }
    );
    const item = asRecord(unwrap(response)) || {};
    return {
      orderId: String(item.orderId || id),
      subtotal: toDecimalString(item.subtotal),
      totalDiscount: toDecimalString(item.totalDiscount),
      addedTax: toDecimalString(item.addedTax),
      totalTax: toDecimalString(item.totalTax),
      serviceCharge: toDecimalString(item.serviceCharge),
      serviceChargeTax: toDecimalString(item.serviceChargeTax),
      grandTotal: toDecimalString(item.grandTotal),
    };
  }

  async updateSalesOrder(
    id: string,
    payload: UpdateSalesOrderDTO
  ): Promise<SalesOrder> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.UPDATE(id),
      payload
    );
    return toSalesOrder(asRecord(unwrap(response)) || {});
  }

  async settleSalesOrder(
    id: string,
    payload: SettleSalesOrderDTO
  ): Promise<SettleSalesOrderResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.SETTLE(id),
      payload
    );
    const item = asRecord(unwrap(response)) || {};
    return {
      orderId: String(item.orderId || id),
      orderNumber: String(item.orderNumber || ""),
      grandTotal: String(item.grandTotal || "0.0000"),
      totalPaid: String(item.totalPaid || "0.0000"),
      change: String(item.change || "0.0000"),
      status: String(item.status || "COMPLETED"),
    };
  }

  async previewSalesOrderEdit(
    id: string,
    payload: EditSalesOrderPreviewDTO
  ): Promise<EditSalesOrderPreviewResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.EDIT_PREVIEW(id),
      payload
    );
    const item = asRecord(unwrap(response)) || {};
    return {
      previousTotal: toDecimalString(item.previousTotal),
      subtotal: toDecimalString(item.subtotal),
      totalDiscount: toDecimalString(item.totalDiscount),
      totalTax: toDecimalString(item.totalTax),
      serviceCharge: toDecimalString(item.serviceCharge),
      tipAmount: toDecimalString(item.tipAmount),
      newTotal: toDecimalString(item.newTotal),
      difference: toDecimalString(item.difference),
    };
  }

  async editSalesOrder(
    id: string,
    payload: EditSalesOrderDTO,
    approverToken: string
  ): Promise<EditSalesOrderResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.EDIT(id),
      payload,
      { headers: { "x-approver-authorization": approverToken } }
    );
    const item = asRecord(unwrap(response)) || {};
    return {
      editId: String(item.editId || ""),
      orderId: String(item.orderId || id),
      orderNumber: String(item.orderNumber || ""),
      previousTotal: toDecimalString(item.previousTotal),
      newTotal: toDecimalString(item.newTotal),
      difference: toDecimalString(item.difference),
    };
  }

  async getSalesOrderEdits(id: string): Promise<SalesOrderEditDTO[]> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>[]>>(
      API_ENDPOINTS.SALES_ORDERS.EDITS(id)
    );
    return asList<Record<string, unknown>>(response).map((item) => ({
      id: String(item.id || ""),
      reason: String(item.reason || ""),
      editedByName: nestedName(item.editedBy, ["fullName"]) || "",
      approvedByName: nestedName(item.approvedBy, ["fullName"]) || "",
      previousTotal: toDecimalString(item.previousTotal),
      newTotal: toDecimalString(item.newTotal),
      createdAt: String(item.createdAt || ""),
    }));
  }

  async deleteSalesOrder(id: string): Promise<SalesOrder> {
    const response = await this.httpClient.delete<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.DELETE(id)
    );
    return toSalesOrder(asRecord(unwrap(response)) || {});
  }

  async getSalesOrderLines(
    salesOrderId: string,
    params?: SalesOrderFilterDTO
  ): Promise<SalesOrderLineListResponseDTO> {
    // A caller that names no page size still gets the whole bill: the endpoint
    // otherwise answers with its default ten lines.
    const query = {
      ...params,
      page: params?.page ?? 1,
      limit: params?.limit ?? ORDER_LINES_LIMIT,
    };
    const response = await this.httpClient.get<
      ApiEnvelope<Record<string, unknown>[]>
    >(API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).LIST, { params: query });
    const data = asList<Record<string, unknown>>(response);
    const meta = toMeta(response, query.limit, data.length);
    return {
      lines: data.map((item) => toSalesOrderLine(item, salesOrderId)),
      ...meta,
    };
  }

  async getSalesOrderLineById(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.get<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).BY_ID(lineId)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async addSalesOrderLine(
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).CREATE,
      normalizeUpsertLinePayload(payload)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async updateSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.patch<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).UPDATE(lineId),
      normalizePartialLinePayload(payload)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async deleteSalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.delete<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).DELETE(lineId)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async fireSalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).FIRE(lineId)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async readySalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).READY(lineId)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async serveSalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).SERVE(lineId)
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async voidSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: VoidSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).VOID(lineId),
      payload
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }

  async compSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: CompSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    const response = await this.httpClient.post<ApiEnvelope<Record<string, unknown>>>(
      API_ENDPOINTS.SALES_ORDERS.LINES(salesOrderId).COMP(lineId),
      payload
    );
    return toSalesOrderLine(asRecord(unwrap(response)) || {}, salesOrderId);
  }
}
