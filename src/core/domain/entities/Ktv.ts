import type { ModifierGroup } from "./Cashier";
import type { ReceiptCashier } from "@/lib/printing/cashier";
export type KtvRoomStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "IN_USE"
  | "PAUSED"
  | "CLEANING"
  | "OUT_OF_SERVICE";

export type KtvSessionState = "OPEN" | "PAUSED" | "PAYMENT_PENDING" | "CLOSED";

export class KtvSession {
  id!: string;
  tenantId?: string;
  roomId?: string;
  guestWalletId?: string;
  hostUserId?: string;
  guestCount!: number;
  openedAt!: string;
  closedAt?: string | null;
  pausedMinutes?: number;
  pausedAt?: string | null;
  salesOrderId?: string;
  sessionState!: KtvSessionState;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  minimumMinutesSnapshot?: number;
  incrementMinutesSnapshot?: number;
  graceMinutesSnapshot?: number;
  roundingModeSnapshot?: "UP" | "DOWN" | "NEAREST";
  plannedMinutes?: number;
  endsAt?: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<KtvSession>) {
    Object.assign(this, data);
  }
}

export class KtvRoom {
  id!: string;
  tenantId!: string;
  locationId!: string;
  roomNumber!: string;
  name!: string;
  capacity!: number;
  rateVariantId!: string;
  sessionPrice?: number;
  priceNow?: number;
  rateLabel?: string;
  rateProductId?: string;
  minimumMinutes!: number;
  incrementMinutes!: number;
  graceMinutes!: number;
  roundingMode!: "UP" | "DOWN" | "NEAREST";
  status!: KtvRoomStatus;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sessions!: KtvSession[];

  constructor(data: Partial<KtvRoom>) {
    Object.assign(this, { sessions: [], ...data });
  }
}

export class KtvQuoteSegment {
  label!: string;
  from!: string;
  to!: string;
  minutes!: number;
  billableMinutes!: number;
  hours!: string;
  rate!: string;
  amount!: string;

  constructor(data: Partial<KtvQuoteSegment>) {
    Object.assign(this, data);
  }
}

export class KtvSessionQuote {
  sessionId!: string;
  roomId!: string;
  roomNumber!: string;
  state!: KtvSessionState;
  openedAt!: string;
  asOf!: string;
  elapsedMinutes!: number;
  pausedMinutes!: number;
  segments!: KtvQuoteSegment[];
  roomCharge!: string;
  fnbCharge!: string;
  runningTotal!: string;
  prepaid!: boolean;
  paidTotal!: string;
  /** PAY_AT_END: added to the bill and paid after close. Null on older sessions. */
  paymentTiming?: "PAY_WHEN_ORDERING" | "PAY_AT_END" | null;
  /** Still to pay, before any member-card discount. */
  amountDue?: string;
  /** Who took the latest payment on the bill. */
  cashier?: ReceiptCashier | null;
  /** The bill's order number, printed as the receipt number. */
  orderNumber?: string | null;

  constructor(data: Partial<KtvSessionQuote>) {
    Object.assign(this, { segments: [], ...data });
  }
}

export class RoomTabletMenuItem {
  variantId!: string;
  /** The product, for its options; missing from an older server. */
  productId?: string;
  name!: string;
  price!: string;
  imageUrl?: string;
  modifierGroups!: ModifierGroup[];

  constructor(data: Partial<RoomTabletMenuItem>) {
    Object.assign(this, { modifierGroups: [], ...data });
  }
}

export class RoomTabletMenuCategory {
  categoryId!: string;
  name!: string;
  items!: RoomTabletMenuItem[];

  constructor(data: Partial<RoomTabletMenuCategory>) {
    Object.assign(this, { items: [], ...data });
  }
}

export class RoomTabletMenu {
  roomNumber!: string;
  categories!: RoomTabletMenuCategory[];
  /** Notes staff tap onto an item ("No ice"), in order. */
  quickNotes!: string[];

  constructor(data: Partial<RoomTabletMenu>) {
    Object.assign(this, { categories: [], quickNotes: [], ...data });
  }
}

export class RoomTabletOrderLine {
  name!: string;
  quantity!: string;
  unitPrice!: string;
  lineTotal!: string;
  status!: string;

  constructor(data: Partial<RoomTabletOrderLine>) {
    Object.assign(this, data);
  }
}

export class RoomTabletSession {
  roomNumber!: string;
  guestCount!: number;
  openedAt!: string;
  endsAt!: string;
  sessionState!: KtvSessionState;
  lines!: RoomTabletOrderLine[];
  fnbTotal!: string;
  walletBalance!: string;

  constructor(data: Partial<RoomTabletSession>) {
    Object.assign(this, { lines: [], ...data });
  }
}
