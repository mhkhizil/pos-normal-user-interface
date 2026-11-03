import {
  SpaRoomStatus,
  SpaRoundingMode,
  SpaSessionQuote,
} from "../../domain/entities/Spa";

export interface CreateSpaRoomDTO {
  locationId: string;
  roomNumber: string;
  name: string;
  capacity: number;
  rateVariantId?: string;
  sessionPrice?: number;
  minimumMinutes?: number;
  incrementMinutes?: number;
  graceMinutes?: number;
  roundingMode?: SpaRoundingMode;
}

export type UpdateSpaRoomDTO = Partial<Omit<CreateSpaRoomDTO, "locationId">> & {
  status?: SpaRoomStatus;
};

/** Paid now: the tapped card, or a payment method alone for cash and the like. */
export interface SpaCardChargeDTO {
  guestCardId?: string;
  paymentMethodId: string;
  posSessionId?: string;
  idempotencyKey?: string;
}

export interface OpenSpaSessionDTO {
  roomId: string;
  guestWalletId?: string;
  guestCount?: number;
  plannedMinutes?: number;
  sessions?: number;
  /** SPA: the service packages booked; their time is the treatment's. */
  packages?: { packageId: string; quantity: number }[];
  /** KTV: the rental the room is sold under. */
  rentalVariantId?: string;
  /** SPA: room charges the cashier ticked; automatic ones are added by the server. */
  roomCharges?: { variantId: string; units?: number }[];
  items?: { variantId: string; quantity: number; hostessId?: string }[];
  prepay?: SpaCardChargeDTO;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  salesChannel?: "POS";
}

/**
 * The card on an order into a running room: required when the venue takes payment
 * when ordering, left out when it takes payment at the end.
 */
export interface RoomOrderCardDTO {
  guestCardId?: string;
  paymentMethodId?: string;
  posSessionId?: string;
  idempotencyKey?: string;
}

export interface ExtendSpaSessionDTO extends RoomOrderCardDTO {
  /** KTV: hours. */
  sessions?: number;
  /** KTV: the rental to extend on; left out, the one the room is on. */
  rentalVariantId?: string;
  /** SPA: more service packages. */
  packages?: { packageId: string; quantity: number }[];
}

/** One item a room orders: the server prices it and its options. */
export interface RoomOrderItemDTO {
  variantId: string;
  quantity: number;
  /** Who gave a service that asks who served, or who ordered it (KTV only). */
  hostessId?: string;
  selectedModifiers?: { modifierId: string }[];
  /** A note for the kitchen or bar. */
  note?: string;
}

export interface ChargeSpaItemsDTO extends RoomOrderCardDTO {
  items: RoomOrderItemDTO[];
}

export interface GiveFreeItemsDTO {
  items: RoomOrderItemDTO[];
  compReasonId?: string;
  reason?: string;
}

export interface SpaChargeResultDTO {
  charged: string;
  balanceAfter: string;
  quote: SpaSessionQuote;
}

/** A tip as a room paid as it goes ends: from its card, or by cash and the like. */
export interface RoomTipDTO extends RoomOrderCardDTO {
  amount: string;
  paymentMethodId: string;
}

export interface CloseSpaSessionDTO {
  closedAt?: string;
  tip?: RoomTipDTO;
  /** The guest's In and Out as the cashier set them, printed beside the room charge. */
  manualInAt?: string;
  manualOutAt?: string;
}
