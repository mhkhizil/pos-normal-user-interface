import { OrderStatus, ServiceType } from "../../application/dtos/CashierDTO";
import type { ReceiptCashier } from "@/lib/printing/cashier";

export class InventoryLocation {
  id!: string;
  tenantId!: string;
  name!: string;
  type!: string;
  parentLocationId?: string | null;

  constructor(data: Partial<InventoryLocation>) {
    Object.assign(this, data);
  }
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: string;
  isDefault: boolean;
}

/** A choice offered with an item, like add-ons; maxSelection 0 or null: no limit. */
export interface ModifierGroup {
  id: string;
  name: string;
  minSelection: number;
  maxSelection: number | null;
  isRequired: boolean;
  modifiers: ModifierOption[];
}

export interface ChosenModifier {
  modifierId: string;
  name: string;
  priceDelta: string;
}

export class Product {
  id!: string;
  tenantId!: string;
  categoryId?: string;
  categoryName?: string;
  name!: string;
  basePrice!: string;
  baseSku?: string;
  baseUomId?: string;
  globalAttributes?: Record<string, unknown>;
  imageUrl?: string;
  sourceImageUrl?: string;
  totalOnHand?: string;
  isAvailable?: boolean;
  isTaxable?: boolean;
  /** Its own taxes; empty means the shop's default taxes. taxRateId is the first. */
  taxRateIds?: string[];
  taxRateId?: string;
  /** All of its own taxes added up, as a fraction. */
  taxRate?: number;
  isPriceInclusive?: boolean;
  trackingType?: string;
  /** ITEM (menu), SERVICE (SPA package, hostess) or RENTAL (room time). */
  kind?: "ITEM" | "SERVICE" | "RENTAL";
  /** POS areas it is sold at; empty means every area. */
  soldAt?: ("BAR" | "SPA" | "KTV")[];
  soldBy?: "EACH" | "TIME";
  /** TIME: minutes one unit buys (60 = per hour) and the fewest units sold. */
  timeBlockMinutes?: number | null;
  minimumBlocks?: number | null;
  /** A service whose till asks which hostess gave it. */
  askWhoServed?: boolean;
  /** Room or table charge sold by time: paid up front, or on a clock. */
  chargeMode?: "PAY_FIRST" | "CLOCK" | null;
  /** Room or table charge added by itself when the place opens. */
  autoApply?: boolean;
  modifierGroups?: ModifierGroup[];
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<Product>) {
    Object.assign(this, data);
  }
}

export class ProductVariant {
  id!: string;
  productId!: string;
  variantSku?: string;
  barcode?: string;
  priceModifier?: string;
  imageUrl?: string;
  sourceImageUrl?: string;
  matrixOptions?: Record<string, unknown>;
  isTaxable?: boolean;
  taxRate?: number;
  isPriceInclusive?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<ProductVariant>) {
    Object.assign(this, data);
  }
}

export class Uom {
  id!: string;
  classId!: string;
  name!: string;
  abbreviation!: string;
  conversionRateToBase!: string;

  constructor(data: Partial<Uom>) {
    Object.assign(this, data);
  }
}

export class TaxRate {
  id!: string;
  tenantId!: string;
  name!: string;
  ratePercentage!: string;
  isPriceInclusive?: boolean | null;

  constructor(data: Partial<TaxRate>) {
    Object.assign(this, data);
  }
}

export interface SalesOrderPlace {
  kind: "TABLE" | "KTV" | "SPA";
  number: string;
  openedAt: string;
  closedAt?: string | null;
  /** A room's In and Out as the cashier set them, printed beside the room charge. */
  manualInAt?: string | null;
  manualOutAt?: string | null;
}

export interface SalesOrderPaymentSummary {
  methodName: string;
  methodKind?: string;
  amount: string;
  paidAt?: string;
}

export class SalesOrder {
  id!: string;
  tenantId!: string;
  locationId!: string;
  customerId?: string;
  orderNumber!: string;
  businessDate?: string;
  salesChannel!: string;
  serviceType!: ServiceType;
  idempotencyKey?: string;
  status!: OrderStatus;
  subtotal!: string;
  totalDiscount!: string;
  totalTax!: string;
  tipAmount?: string;
  serviceCharge?: string;
  grandTotal!: string;
  pickupNumber?: string;
  pickedUpAt?: string | null;
  /** Who took the latest payment, as the server tells it; only on one order. */
  cashier?: ReceiptCashier | null;
  discountReasonId?: string;
  customerName?: string;
  itemCount?: number;
  itemSummary?: string;
  /** The outlet the order was sold at; only on one order. */
  locationName?: string;
  /** The table or room the bill was run up at, with when it opened and closed; only on one order. */
  place?: SalesOrderPlace | null;
  /** The payments on the bill with their method's name; only on one order. */
  payments?: SalesOrderPaymentSummary[];
  createdAt!: string;
  updatedAt!: string;

  constructor(data: Partial<SalesOrder>) {
    Object.assign(this, data);
  }
}

export class SalesOrderLine {
  id!: string;
  salesOrderId!: string;
  variantId!: string;
  quantity!: string;
  unitPrice!: string;
  lineDiscount?: string;
  taxRateId?: string;
  taxAmount?: string;
  /** Whether taxAmount is already inside the price rather than added on top. */
  taxInclusive?: boolean;
  appliedPromotionId?: string;
  status?: string;
  firedAt?: string;
  voidedAt?: string;
  voidReasonId?: string;
  compReasonId?: string;
  courseType?: string;
  selectedModifiers?: Record<string, unknown> | ChosenModifier[];
  seatNumber?: number;
  /** The hostess who gave this service, on a KTV bill. */
  hostessId?: string;
  /** Whether the product names the hostess who gave it, rather than who ordered it. */
  askWhoServed?: boolean;
  /** The promotions the line was sold under, as the server recorded them. */
  promotionNames?: string[];
  productName?: string;
  variantName?: string;
  sku?: string;
  /**
   * The category this line was sold under, recorded by the server. Station
   * printing routes by it, so it must not depend on the menu this till has
   * loaded (a newly added item may not be in it yet).
   */
  categoryId?: string;
  categoryName?: string;
  /** The menu price for one, before options, as the server sent it with the line. */
  menuPrice?: string;
  /** A price the cashier set for this sale only, on a cart line not saved yet. */
  priceOverride?: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<SalesOrderLine>) {
    Object.assign(this, data);
  }
}

export class OrderPayment {
  id!: string;
  tenantId?: string;
  salesOrderId!: string;
  paymentMethodId!: string;
  posSessionId?: string;
  amount!: string;
  tipAmount?: string;
  transactionReference?: string;
  paymentDate?: string;
  walletLedgerEntryId?: string | null;
  updatedAt?: string;

  constructor(data: Partial<OrderPayment>) {
    Object.assign(this, data);
  }
}

export class KdsTicketLine {
  id!: string;
  ticketId!: string;
  salesOrderLineId!: string;
  productName!: string;
  quantity!: string;
  seatNumber?: number;
  kitchenModifiers?: string;
  modifierPrices?: string;
  /** The KTV lady who ordered the line, named on the kitchen slip. */
  orderedBy?: string;
  status!: string;
  bumpedAt?: string | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(data: Partial<KdsTicketLine>) {
    Object.assign(this, data);
  }
}

export class KdsStation {
  id!: string;
  tenantId!: string;
  locationId!: string;
  name!: string;
  displayColor?: string;
  printerIds!: string[];
  routingRules?: Record<string, unknown>;
  deletedAt?: string | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(data: Partial<KdsStation>) {
    Object.assign(this, { printerIds: [], ...data });
  }
}

export class PaymentMethod {
  id!: string;
  tenantId!: string;
  name!: string;
  kind?: string;
  code?: string;
  type?: string;
  isActive?: boolean;
  glAccountId?: string;
  createdAt?: string;
  updatedAt?: string;
  isLocalFallback?: boolean;

  constructor(data: Partial<PaymentMethod>) {
    Object.assign(this, data);
  }
}

export class PosRegister {
  id!: string;
  tenantId!: string;
  locationId!: string;
  code!: string;
  name!: string;
  macAddress?: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<PosRegister>) {
    Object.assign(this, data);
  }
}

export class PosSession {
  id!: string;
  tenantId!: string;
  registerId!: string;
  cashierId!: string;
  openedAt?: string;
  closedAt?: string | null;
  openingCashFloat?: string;
  expectedClosingCash?: string;
  actualClosingCash?: string;
  cashVariance?: string;
  status!: "OPEN" | "CLOSED";
  updatedAt?: string;

  constructor(data: Partial<PosSession>) {
    Object.assign(this, data);
  }
}

export class DiningZone {
  id!: string;
  tenantId!: string;
  name!: string;
  sortOrder!: number;
  layoutSvg?: string;

  constructor(data: Partial<DiningZone>) {
    Object.assign(this, data);
  }
}

export class DiningTableActiveSession {
  id!: string;
  salesOrderId!: string;
  guestCount!: number;
  sessionState!: string;
  openedAt!: string;
  seatedSeconds!: number;
  itemCount!: number;

  constructor(data: Partial<DiningTableActiveSession>) {
    Object.assign(this, data);
  }
}

export class DiningTable {
  id!: string;
  tenantId!: string;
  zoneId!: string;
  tableNumber!: string;
  maxSeats!: number;
  posX?: string;
  posY?: string;
  shape?: string;
  status!: "AVAILABLE" | "OCCUPIED" | "DIRTY" | "RESERVED";
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  activeSession?: DiningTableActiveSession | null;

  constructor(data: Partial<DiningTable>) {
    Object.assign(this, data);
  }
}

export class TableSession {
  id!: string;
  tenantId!: string;
  tableId!: string;
  waiterId?: string;
  guestCount!: number;
  openedAt!: string;
  closedAt?: string | null;
  salesOrderId!: string;
  sessionState!: "SEATED" | "ORDERING" | "SERVED" | "PAYMENT_PENDING" | "CLOSED";
  posRegisterId?: string;
  openedByPosSessionId?: string;
  /** Tables pushed together with this one for the same party and bill. */
  joinedTableIds?: string[];

  constructor(data: Partial<TableSession>) {
    Object.assign(this, data);
  }
}

export interface KdsTicketPlace {
  kind: "TABLE" | "SPA_ROOM" | "KTV_ROOM" | "COUNTER";
  number: string | null;
  name: string | null;
  guestCount: number | null;
}

export class KdsTicket {
  id!: string;
  tenantId!: string;
  sessionId!: string;
  salesOrderId!: string;
  stationId!: string;
  ticketNumber!: string;
  courseType!: string;
  firedAt!: string;
  startedAt?: string | null;
  bumpedAt?: string | null;
  status!: "PENDING" | "PREPARING" | "READY" | "EXPEDITED";
  lines?: Array<{
    name: string;
    quantity: string;
    categoryId?: string;
    modifiers?: string;
    modifierPrices?: string;
    orderedBy?: string;
  }>;
  kdsTicketLines?: KdsTicketLine[];
  station?: KdsStation;
  /** Where the order is going: a table, a SPA or KTV room, or the counter. */
  place?: KdsTicketPlace | null;
  orderNumber?: string | null;
  serviceType?: string | null;
  posType?: string | null;
  pickupNumber?: string | null;
  /** Who sent the order to the kitchen. */
  sentBy?: ReceiptCashier | null;
  /** STAFF from a till, TABLET from a room tablet. */
  sentFrom?: string | null;
  deviceName?: string | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(data: Partial<KdsTicket>) {
    Object.assign(this, data);
  }
}

export class CounterOrderDetail extends SalesOrder {
  salesOrderLines!: SalesOrderLine[];
  orderPayments!: OrderPayment[];
  kdsTickets!: KdsTicket[];

  constructor(data: Partial<CounterOrderDetail>) {
    super(data);
    Object.assign(this, {
      salesOrderLines: [],
      orderPayments: [],
      kdsTickets: [],
      ...data,
    });
  }
}

export class AdjustmentReason {
  id!: string;
  tenantId!: string;
  code!: string;
  name!: string;
  description?: string;
  isActive!: boolean;
  requiresManagerOverride!: boolean;

  constructor(data: Partial<AdjustmentReason>) {
    Object.assign(this, data);
  }
}

export class WaitlistEntry {
  id!: string;
  tenantId!: string;
  locationId!: string;
  customerId?: string;
  guestName!: string;
  guestPhone!: string;
  partySize!: number;
  joinedAt!: string;
  estimatedWaitMins?: number;
  preferredZoneId?: string;
  assignedTableId?: string;
  tableSessionId?: string;
  notifiedAt?: string | null;
  seatedAt?: string | null;
  canceledAt?: string | null;
  notes?: string | null;
  status!: "WAITING" | "NOTIFIED" | "SEATED" | "CANCELED" | "NO_SHOW";

  constructor(data: Partial<WaitlistEntry>) {
    Object.assign(this, data);
  }
}

export class TipPool {
  id!: string;
  tenantId!: string;
  locationId!: string;
  name!: string;
  periodStart!: string;
  periodEnd!: string;
  distributionMethod!: string;
  totalTips!: string;
  totalServiceCharge!: string;
  includeServiceCharge!: boolean;
  serviceChargeShareBps!: number;
  totalDistributable!: string;
  status!: "OPEN" | "SETTLED";
  settledAt?: string | null;
  settledBy?: string | null;
  notes?: string | null;

  constructor(data: Partial<TipPool>) {
    Object.assign(this, data);
  }
}

export class TipPoolAllocation {
  id!: string;
  poolId!: string;
  userId!: string;
  role!: string;
  hoursWorked!: string;
  weight!: string;
  amount!: string;
  notes?: string | null;

  constructor(data: Partial<TipPoolAllocation>) {
    Object.assign(this, data);
  }
}
