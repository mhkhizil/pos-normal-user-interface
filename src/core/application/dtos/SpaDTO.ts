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
  rateVariantId: string;
  minimumMinutes: number;
  incrementMinutes: number;
  graceMinutes: number;
  roundingMode: SpaRoundingMode;
}

export type UpdateSpaRoomDTO = Partial<Omit<CreateSpaRoomDTO, "locationId">> & {
  status?: SpaRoomStatus;
};

export interface SpaCardChargeDTO {
  guestCardId: string;
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
  prepay?: SpaCardChargeDTO;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  salesChannel?: "POS";
}

export interface ExtendSpaSessionDTO extends SpaCardChargeDTO {
  sessions: number;
}

export interface ChargeSpaItemsDTO extends SpaCardChargeDTO {
  items: { variantId: string; quantity: number }[];
}

export interface SpaChargeResultDTO {
  charged: string;
  balanceAfter: string;
  quote: SpaSessionQuote;
}

export interface CloseSpaSessionDTO {
  closedAt?: string;
}
