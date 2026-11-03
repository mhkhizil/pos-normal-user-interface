import {
  CreatePrintTemplateDTO,
  PrintTemplateFilterDTO,
  PrintTemplateListDTO,
  ResolvePrintTemplateDTO,
  UpdatePrintTemplateDTO,
} from "../../application/dtos/PrintTemplateDTO";
import {
  PrintCompany,
  PrintPaperWidth,
  PrintTemplate,
  PrintTemplateSettings,
  PrintTemplateSource,
  defaultPrintTemplateSettings,
  isPrintTemplateType,
} from "../../domain/entities/PrintTemplate";
import { IPrintTemplateRepository } from "../../domain/repositories/IPrintTemplateRepository";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";

type RecordValue = Record<string, unknown>;

interface ApiEnvelope<T> {
  data?: T;
  meta?: RecordValue;
}

const unwrap = <T>(response: ApiEnvelope<T> | T): T => {
  if (response && typeof response === "object" && "data" in response) {
    const data = (response as ApiEnvelope<T>).data;
    if (data && typeof data === "object" && "data" in (data as object)) {
      return unwrap(data as T);
    }
    return data as T;
  }
  return response as T;
};

const asRecord = (value: unknown): RecordValue | undefined =>
  value && typeof value === "object" ? (value as RecordValue) : undefined;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const toSettings = (value: unknown): PrintTemplateSettings => {
  const defaults = defaultPrintTemplateSettings();
  const settings = asRecord(value) || {};
  const header = asRecord(settings.header) || {};
  const item = asRecord(settings.item) || {};
  const bill = asRecord(settings.bill) || {};
  const other = asRecord(settings.other) || {};
  const copies = Array.isArray(settings.copies)
    ? settings.copies.map((copy) => String(copy))
    : defaults.copies;
  return {
    language: String(settings.language || defaults.language),
    copies,
    header: {
      logo: asBoolean(header.logo, defaults.header.logo),
      outletName: asBoolean(header.outletName, defaults.header.outletName),
      address: asBoolean(header.address, defaults.header.address),
      contact: asBoolean(header.contact, defaults.header.contact),
      email: asBoolean(header.email, defaults.header.email),
    },
    item: {
      bilingual: asBoolean(item.bilingual, defaults.item.bilingual),
      fontSize: String(item.fontSize || defaults.item.fontSize),
      qtyFirst: asBoolean(item.qtyFirst, defaults.item.qtyFirst),
      categorySubtotal: asBoolean(
        item.categorySubtotal,
        defaults.item.categorySubtotal
      ),
      hidePriceOnOrderBill: asBoolean(
        item.hidePriceOnOrderBill,
        defaults.item.hidePriceOnOrderBill
      ),
      itemTextScale: String(item.itemTextScale || defaults.item.itemTextScale),
      otherTextScale: String(item.otherTextScale || defaults.item.otherTextScale),
      productRemarks: asBoolean(item.productRemarks, defaults.item.productRemarks),
      modifiers: asBoolean(item.modifiers, defaults.item.modifiers),
      price: asBoolean(item.price, defaults.item.price),
    },
    bill: {
      amountAfterDiscount: asBoolean(
        bill.amountAfterDiscount,
        defaults.bill.amountAfterDiscount
      ),
      totalPayment: asBoolean(bill.totalPayment, defaults.bill.totalPayment),
      payTime: asBoolean(bill.payTime, defaults.bill.payTime),
      rounding: asBoolean(bill.rounding, defaults.bill.rounding),
    },
    other: {
      orderNumber: asBoolean(other.orderNumber, defaults.other.orderNumber),
      cashier: asBoolean(other.cashier, defaults.other.cashier),
      serviceType: asBoolean(other.serviceType, defaults.other.serviceType),
      tableOrRoom: asBoolean(other.tableOrRoom, defaults.other.tableOrRoom),
      pickupCode: asBoolean(other.pickupCode, defaults.other.pickupCode),
      footerText: footerTextOf(other.footerText, defaults.other.footerText),
    },
  };
};

/**
 * The footer a template prints. The server sends null for "print nothing", as
 * kitchen tickets do by default; it must not reach the paper as the word "null".
 */
const footerTextOf = (value: unknown, fallback: string) => {
  if (value === undefined) return fallback;
  if (value === null) return "";
  const text = String(value);
  return text.trim().toLowerCase() === "null" ? "" : text;
};

const toTemplate = (item: RecordValue) => {
  const rawType = String(item.type || "");
  return new PrintTemplate({
    id: String(item.id || ""),
    tenantId: item.tenantId ? String(item.tenantId) : undefined,
    locationId: item.locationId ? String(item.locationId) : undefined,
    type: isPrintTemplateType(rawType) ? rawType : "RECEIPT",
    name: String(item.name || ""),
    paperWidth: (item.paperWidth === "MM58" ? "MM58" : "MM80") as PrintPaperWidth,
    isDefault: typeof item.isDefault === "boolean" ? item.isDefault : undefined,
    source: item.source ? (String(item.source) as PrintTemplateSource) : undefined,
    settings: toSettings(item.settings),
    deletedAt: item.deletedAt ? String(item.deletedAt) : null,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

export class ApiPrintTemplateRepository implements IPrintTemplateRepository {
  constructor(private readonly httpClient: HttpClient) {}

  async list(params?: PrintTemplateFilterDTO): Promise<PrintTemplateListDTO> {
    const response = await this.httpClient.get<ApiEnvelope<RecordValue[]>>(
      API_ENDPOINTS.PRINT_TEMPLATES.LIST,
      { params }
    );
    const value = unwrap(response);
    const rows = Array.isArray(value) ? value : [];
    const templates = rows.map(toTemplate);
    const meta =
      response && typeof response === "object" && "meta" in response
        ? response.meta || {}
        : {};
    const limit = Number(meta.limit || params?.limit || 10);
    const total = Number(meta.total ?? templates.length);
    return {
      templates,
      total,
      page: Number(meta.page || params?.page || 1),
      limit,
      totalPages: Number(
        meta.totalPages || Math.max(1, Math.ceil(total / Math.max(limit, 1)))
      ),
    };
  }

  async getById(id: string): Promise<PrintTemplate> {
    const response = await this.httpClient.get<ApiEnvelope<RecordValue>>(
      API_ENDPOINTS.PRINT_TEMPLATES.BY_ID(id)
    );
    return toTemplate(unwrap(response));
  }

  async resolve(params: ResolvePrintTemplateDTO): Promise<PrintTemplate> {
    const response = await this.httpClient.get<ApiEnvelope<RecordValue>>(
      API_ENDPOINTS.PRINT_TEMPLATES.RESOLVE,
      { params }
    );
    return toTemplate(unwrap(response));
  }

  async create(payload: CreatePrintTemplateDTO): Promise<PrintTemplate> {
    const response = await this.httpClient.post<ApiEnvelope<RecordValue>>(
      API_ENDPOINTS.PRINT_TEMPLATES.CREATE,
      payload
    );
    return toTemplate(unwrap(response));
  }

  async update(id: string, payload: UpdatePrintTemplateDTO): Promise<PrintTemplate> {
    const response = await this.httpClient.patch<ApiEnvelope<RecordValue>>(
      API_ENDPOINTS.PRINT_TEMPLATES.UPDATE(id),
      payload
    );
    return toTemplate(unwrap(response));
  }

  async delete(id: string): Promise<PrintTemplate> {
    const response = await this.httpClient.delete<ApiEnvelope<RecordValue>>(
      API_ENDPOINTS.PRINT_TEMPLATES.DELETE(id)
    );
    return toTemplate(unwrap(response));
  }

  async company(): Promise<PrintCompany> {
    const response = await this.httpClient.get<ApiEnvelope<RecordValue>>(
      API_ENDPOINTS.PRINT_TEMPLATES.COMPANY
    );
    const item = unwrap(response) || {};
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    const city = text(item.city);
    const address = text(item.address);
    return {
      name: text(item.name) || "",
      legalName: text(item.legalName),
      address: address && city && !address.includes(city) ? `${address}, ${city}` : address || city,
      phone: text(item.phone),
      email: text(item.email),
      logoUrl: text(item.logoUrl),
    };
  }
}
