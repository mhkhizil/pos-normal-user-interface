import {
  SpaRoomStatus,
  SpaRoundingMode,
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

export interface OpenSpaSessionDTO {
  roomId: string;
  guestWalletId?: string;
  guestCount?: number;
  plannedMinutes?: number;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  salesChannel?: "POS";
}

export interface CloseSpaSessionDTO {
  closedAt?: string;
}
