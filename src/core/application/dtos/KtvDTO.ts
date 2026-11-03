import {
  KtvRoom,
  KtvRoomStatus,
  KtvSessionQuote,
} from "../../domain/entities/Ktv";
import { RoomOrderCardDTO, RoomOrderItemDTO, RoomTipDTO, SpaCardChargeDTO } from "./SpaDTO";

export interface KtvRoomFilterDTO {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface KtvRoomListDTO {
  rooms: KtvRoom[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateKtvRoomDTO {
  locationId: string;
  roomNumber: string;
  name: string;
  capacity: number;
  rateVariantId?: string;
  sessionPrice?: number;
  minimumMinutes?: number;
  incrementMinutes?: number;
  graceMinutes?: number;
  roundingMode?: "UP" | "DOWN" | "NEAREST";
}

export type UpdateKtvRoomDTO = Partial<CreateKtvRoomDTO> & {
  status?: KtvRoomStatus;
};

export interface OpenKtvSessionDTO {
  roomId: string;
  guestCount?: number;
  guestWalletId?: string;
  hostUserId?: string;
  posRegisterId?: string;
  openedByPosSessionId?: string;
  salesChannel: "POS";
  hours?: number;
  /** The rental the room is sold under; left out, the room's own rate. */
  rentalVariantId?: string;
  items?: { variantId: string; quantity: number; hostessId?: string }[];
  prepay?: SpaCardChargeDTO;
}

export interface CloseKtvSessionDTO {
  closedAt: string;
  tip?: RoomTipDTO;
  /** The guest's In and Out as the cashier set them, printed beside the room charge. */
  manualInAt?: string;
  manualOutAt?: string;
}

export interface ExtendKtvSessionDTO extends RoomOrderCardDTO {
  hours: number;
  /** Left out: the rental the room is already on. */
  rentalVariantId?: string;
}

export interface ChargeKtvItemsDTO extends RoomOrderCardDTO {
  items: RoomOrderItemDTO[];
}

export interface KtvChargeResultDTO {
  charged: string;
  balanceAfter: string;
  quote: KtvSessionQuote;
}
