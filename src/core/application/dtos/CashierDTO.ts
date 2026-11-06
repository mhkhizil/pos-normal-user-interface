import { DiningTable, Product, ProductVariant } from "../../domain/entities/Cashier";

export type ServiceType = "TABLE" | "DINE_IN" | "TAKE_AWAY" | "DELIVERY" | "PICK_UP";
export type ApiServiceType = "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "COUNTER";

export function toApiServiceType(
  serviceType: ServiceType | ApiServiceType
): ApiServiceType {
  switch (serviceType) {
    case "TABLE":
      return "DINE_IN";
    case "TAKE_AWAY":
      return "TAKEAWAY";
    case "PICK_UP":
      return "COUNTER";
    case "TAKEAWAY":
      return "TAKEAWAY";
    case "COUNTER":
      return "COUNTER";
    default:
      return serviceType;
  }
}

export function fromApiServiceType(serviceType?: string): ServiceType {
  switch (String(serviceType || "").toUpperCase()) {
    case "TAKEAWAY":
      return "TAKE_AWAY";
    case "COUNTER":
      return "PICK_UP";
    case "DELIVERY":
      return "DELIVERY";
    case "DINE_IN":
      return "DINE_IN";
    default:
      return "DINE_IN";
  }
}
export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "VOIDED"
  | "ON_HOLD_CREDIT"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";
export type DiningTableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY" | "RESERVED";
export type TableSessionState =
  | "SEATED"
  | "ORDERING"
  | "SERVED"
  | "PAYMENT_PENDING"
  | "CLOSED";
export type WaitlistStatus =
  | "WAITING"
  | "NOTIFIED"
  | "SEATED"
  | "CANCELED"
  | "NO_SHOW";
export type TipPoolStatus = "OPEN" | "SETTLED";

export interface PaginatedQueryDTO {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ProductFilterDTO extends PaginatedQueryDTO {
  categoryId?: string;
  trackingType?: string;
  inStockOnly?: boolean;
  locationId?: string;
  kind?: "ITEM" | "SERVICE" | "RENTAL";
  /** A room or table: only the rentals usable there. */
  placeId?: string;
  isAvailable?: boolean;
}

export type ProductTrackingType = "STANDARD" | "SERIALIZED";

export interface CreateProductDTO {
  name: string;
  tenantId: string;
  baseSku: string;
  basePrice: string;
  baseUomId: string;
  categoryId?: string;
  globalAttributes?: Record<string, unknown>;
  imageUrl?: string;
  trackingType?: string;
  isAvailable?: boolean;
  isTaxable?: boolean;
  taxRateId?: string;
}

export interface UpdateProductDTO {
  name?: string;
  baseSku?: string;
  basePrice?: string;
  baseUomId?: string;
  categoryId?: string;
  globalAttributes?: Record<string, unknown>;
  imageUrl?: string;
  trackingType?: string;
  isAvailable?: boolean;
  isTaxable?: boolean;
  taxRateId?: string;
}

export interface ProductListDTO {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateProductVariantDTO {
  variantSku: string;
  matrixOptions: Record<string, unknown>;
  barcode?: string;
  priceModifier?: string;
  imageUrl?: string;
}

export interface UpdateProductVariantDTO {
  variantSku?: string;
  matrixOptions?: Record<string, unknown>;
  barcode?: string;
  priceModifier?: string;
  imageUrl?: string;
}

export interface ProductVariantListDTO {
  variants: ProductVariant[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UomFilterDTO extends PaginatedQueryDTO {
  classId?: string;
}

export interface SalesOrderFilterDTO extends PaginatedQueryDTO {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  serviceType?: ApiServiceType;
  waitingPickup?: boolean;
}

export interface DiningTableFilterDTO extends PaginatedQueryDTO {
  zoneId?: string;
  status?: DiningTableStatus;
}

export type DiningTableShape = "RECTANGLE" | "CIRCLE";

export interface CreateDiningTableDTO {
  tenantId: string;
  zoneId: string;
  tableNumber: string;
  maxSeats: number;
  posX?: number;
  posY?: number;
  shape?: DiningTableShape;
  status?: DiningTableStatus;
}

export interface UpdateDiningTableDTO {
  zoneId?: string;
  tableNumber?: string;
  maxSeats?: number;
  posX?: number;
  posY?: number;
  shape?: DiningTableShape;
  status?: DiningTableStatus;
}

export interface DiningTableListDTO {
  tables: DiningTable[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TableSessionFilterDTO extends PaginatedQueryDTO {
  tableId?: string;
  waiterId?: string;
  sessionState?: TableSessionState;
  openOnly?: boolean;
}

export interface PosRegisterFilterDTO extends PaginatedQueryDTO {}

export interface PosSessionFilterDTO extends PaginatedQueryDTO {
  registerId?: string;
  cashierId?: string;
  status?: "OPEN" | "CLOSED";
}

export interface CreateSalesOrderDTO {
  tenantId: string;
  locationId: string;
  customerId?: string;
  orderNumber?: string;
  salesChannel?: string;
  serviceType?: ServiceType | ApiServiceType;
  idempotencyKey?: string;
  subtotal?: string;
  totalDiscount?: string;
  totalTax?: string;
  grandTotal?: string;
  status?: OrderStatus;
}

export interface UpsertSalesOrderLineDTO {
  variantId: string;
  quantity: string;
  unitPrice: string;
  lineDiscount?: string;
  taxRateId?: string;
  taxAmount?: string;
  appliedPromotionId?: string;
  courseType?: string;
  selectedModifiers?: Array<{
    modifierId: string;
    name: string;
    priceDelta: string;
  }>;
  seatNumber?: number;
  /** Extra fees only: the name on the bill, as typed for "Other". */
  name?: string;
  /** The hostess who gave a service, or who ordered an item; null for the customer. */
  hostessId?: string | null;
  /** A note for the kitchen or bar; null clears it. */
  note?: string | null;
}

export type UpdateSalesOrderLineDTO = Partial<UpsertSalesOrderLineDTO>;

export interface CreateOrderPaymentDTO {
  tenantId: string;
  paymentMethodId: string;
  posSessionId?: string;
  amount: string;
  guestCardId?: string;
  tipAmount?: string;
  transactionReference?: string;
}

export interface CreatePosRegisterDTO {
  tenantId: string;
  locationId: string;
  code: string;
  name: string;
  macAddress: string;
}

export interface CreatePosSessionDTO {
  tenantId: string;
  registerId: string;
  cashierId: string;
  openingCashFloat: string;
  expectedClosingCash?: string;
  status: "OPEN" | "CLOSED";
}

export interface CheckoutRequestDTO {
  locationId: string;
  salesChannel: string;
  customerId?: string;
  posSessionId?: string;
  serviceType: ServiceType | ApiServiceType;
  lineStatus?: string;
  tipAmount?: string;
  serviceCharge?: string;
  /** Omitted charge flags default to true on the backend. */
  includeTax?: boolean;
  includeServiceCharge?: boolean;
  discountReasonId?: string;
  idempotencyKey?: string;
  tenantId: string;
  items: Array<{
    variantId: string;
    quantity: string;
    lineDiscount?: string;
    /** Extra fees only: the amount charged for one, and its name. */
    unitPrice?: string;
    name?: string;
    selectedModifiers?: Array<{ modifierId: string }>;
    hostessId?: string;
    note?: string;
  }>;
  payments: CheckoutPaymentEntryDTO[];
}

export interface VoidCheckoutResultDTO {
  orderId: string;
  orderNumber?: string;
  grandTotal?: string;
  totalPaid?: string;
  change?: string;
  status?: string;
}

export interface OpenTableSessionDTO {
  tenantId: string;
  tableId: string;
  locationId: string;
  guestCount: number;
  waiterId?: string;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  salesChannel: "POS";
}

export interface UpdateTableSessionStateDTO {
  sessionState: TableSessionState;
}

export interface SplitLineDTO {
  lineId: string;
  quantity: number;
}

/** Guests changing places: another table, bills combined or split, tables joined. */
export type TableSeatingChangeDTO =
  | { kind: "move"; tableId: string }
  | { kind: "merge"; sourceSessionId: string; keepTable: boolean }
  | { kind: "split"; targetSessionId: string; lines: SplitLineDTO[] }
  | { kind: "join"; tableId: string }
  | { kind: "release"; tableId: string };

export type TableWarningLevel = "OK" | "WARNING" | "CRITICAL";

export interface TableWarningPolicyDTO {
  warningAfterMinutes: number;
  criticalAfterMinutes: number;
}

export interface TableWarningStatusDTO {
  level: TableWarningLevel;
  elapsedMinutes: number;
  elapsedLabel: string;
}

export interface CheckoutPaymentEntryDTO {
  paymentMethodId: string;
  amount: string;
  guestCardId?: string;
  tipAmount?: string;
  transactionReference?: string;
}

export interface SplitPaymentTenderDTO {
  id: string;
  paymentMethodId: string;
  amount: string;
  guestCardId?: string;
}

export interface TableSessionCheckoutDTO {
  /** The open shift taking payment; it can differ from the shift that opened an overdue table. */
  posSessionId: string;
  payments: CheckoutPaymentEntryDTO[];
  tipAmount?: number;
  serviceCharge?: number;
  /** Omitted charge flags default to true on the backend. */
  includeTax?: boolean;
  includeServiceCharge?: boolean;
  discountReasonId?: string;
  totalDiscount?: number;
  /** Whose account a credit tender goes on. */
  customerId?: string;
}

export interface FireKdsDTO {
  sessionId?: string;
  salesOrderId?: string;
}

export type KdsTicketStatus = "PENDING" | "PREPARING" | "READY" | "EXPEDITED";

export interface KdsTicketFilterDTO extends PaginatedQueryDTO {
  stationId?: string;
  sessionId?: string;
  salesOrderId?: string;
  status?: KdsTicketStatus;
  activeOnly?: boolean;
}

export interface KdsTicketListDTO {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WaitlistFilterDTO extends PaginatedQueryDTO {
  locationId?: string;
  status?: WaitlistStatus;
  activeOnly?: boolean;
}

export interface CreateWaitlistEntryDTO {
  tenantId: string;
  locationId: string;
  customerId?: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  estimatedWaitMins?: number;
  preferredZoneId?: string;
  notes?: string;
}

export interface UpdateWaitlistEntryDTO {
  locationId?: string;
  customerId?: string;
  guestName?: string;
  guestPhone?: string;
  partySize?: number;
  estimatedWaitMins?: number;
  preferredZoneId?: string;
  notes?: string;
}

export interface SeatWaitlistEntryDTO {
  tableId: string;
  waiterId?: string;
  guestCount: number;
  posRegisterId?: string;
  openedByPosSessionId?: string;
}

export interface TipPoolFilterDTO {
  page?: number;
  limit?: number;
  locationId?: string;
  status?: TipPoolStatus;
  fromDate?: string;
  toDate?: string;
}

export interface CreateTipPoolDTO {
  tenantId: string;
  locationId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  distributionMethod: string;
  includeServiceCharge?: boolean;
  serviceChargeShareBps?: number;
  notes?: string;
}

export interface UpdateTipPoolDTO {
  name?: string;
  periodStart?: string;
  periodEnd?: string;
  distributionMethod?: string;
  includeServiceCharge?: boolean;
  serviceChargeShareBps?: number;
  notes?: string;
}

export interface TipPoolAllocationDTO {
  userId: string;
  role: string;
  hoursWorked?: number;
  weight?: number;
  amount?: number;
  notes?: string | null;
}
