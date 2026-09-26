export type SpaRoomStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "CLEANING"
  | "OUT_OF_SERVICE";

export type SpaSessionState = "OPEN" | "PAUSED" | "PAYMENT_PENDING" | "CLOSED";

export type SpaRoundingMode = "UP" | "DOWN" | "NEAREST";

export class SpaSession {
  id!: string;
  tenantId?: string;
  roomId?: string;
  guestWalletId?: string;
  guestCount!: number;
  openedAt!: string;
  closedAt?: string | null;
  pausedMinutes?: number;
  pausedAt?: string | null;
  salesOrderId?: string;
  sessionState!: SpaSessionState;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  plannedMinutes?: number;
  endsAt?: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<SpaSession>) {
    Object.assign(this, data);
  }
}

export class SpaRoom {
  id!: string;
  tenantId!: string;
  locationId!: string;
  roomNumber!: string;
  name!: string;
  capacity!: number;
  rateVariantId!: string;
  sessionPrice?: number;
  rateProductId?: string;
  minimumMinutes!: number;
  incrementMinutes!: number;
  graceMinutes!: number;
  roundingMode!: SpaRoundingMode;
  status!: SpaRoomStatus;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sessions!: SpaSession[];

  constructor(data: Partial<SpaRoom>) {
    Object.assign(this, { sessions: [], ...data });
  }
}

export class SpaQuoteSegment {
  label!: string;
  from!: string;
  to!: string;
  minutes!: number;
  billableMinutes!: number;
  hours!: string;
  treatments!: string;
  rate!: string;
  amount!: string;

  constructor(data: Partial<SpaQuoteSegment>) {
    Object.assign(this, data);
  }
}

export class SpaSessionQuote {
  sessionId!: string;
  roomId!: string;
  roomNumber!: string;
  state!: SpaSessionState;
  openedAt!: string;
  asOf!: string;
  elapsedMinutes!: number;
  pausedMinutes!: number;
  segments!: SpaQuoteSegment[];
  treatmentCharge!: string;
  servicesCharge!: string;
  runningTotal!: string;
  prepaid!: boolean;
  paidTotal!: string;

  constructor(data: Partial<SpaSessionQuote>) {
    Object.assign(this, { segments: [], ...data });
  }
}
