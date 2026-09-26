import { OrderStatus, ServiceType } from "../../application/dtos/CashierDTO";

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

export class Product {
  id!: string;
  tenantId!: string;
  categoryId?: string;
  categoryName?: string;
  name!: string;
  basePrice!: string;
  baseSku?: string;
  imageUrl?: string;
  totalOnHand?: string;
  isTaxable?: boolean;
  taxRate?: number;
  isPriceInclusive?: boolean;
  trackingType?: string;

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
  matrixOptions?: Record<string, unknown>;
  isTaxable?: boolean;
  taxRate?: number;
  isPriceInclusive?: boolean;

  constructor(data: Partial<ProductVariant>) {
    Object.assign(this, data);
  }
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
  discountReasonId?: string;
  customerName?: string;
  itemCount?: number;
  itemSummary?: string;
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
  appliedPromotionId?: string;
  status?: string;
  firedAt?: string;
  voidedAt?: string;
  voidReasonId?: string;
  compReasonId?: string;
  courseType?: string;
  selectedModifiers?: Record<string, unknown>;
  seatNumber?: number;
  productName?: string;
  variantName?: string;
  sku?: string;
  categoryName?: string;
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
  printerId?: string;
  routingRules?: Record<string, unknown>;
  deletedAt?: string | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(data: Partial<KdsStation>) {
    Object.assign(this, data);
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

  constructor(data: Partial<TableSession>) {
    Object.assign(this, data);
  }
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
  lines?: Array<{ name: string; quantity: string; categoryId?: string }>;
  kdsTicketLines?: KdsTicketLine[];
  station?: KdsStation;
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
