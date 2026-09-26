import {
  ChargeSpaItemsDTO,
  GiveFreeItemsDTO,
  CloseSpaSessionDTO,
  ExtendSpaSessionDTO,
  SpaChargeResultDTO,
  CreateSpaRoomDTO,
  OpenSpaSessionDTO,
  UpdateSpaRoomDTO,
} from "../dtos/SpaDTO";
import { SpaRoom, SpaSession, SpaSessionQuote } from "../../domain/entities/Spa";
import { ISpaRepository } from "../../domain/repositories/ISpaRepository";
import { ISpaService } from "../../domain/services/ISpaService";

const requireId = (value: string | undefined, label: string) => {
  if (!value?.trim()) throw new Error(`${label} is required`);
};

export class SpaService implements ISpaService {
  constructor(private repository: ISpaRepository) {}

  getBoard(locationId?: string): Promise<SpaRoom[]> {
    return this.repository.getBoard(locationId);
  }

  createRoom(payload: CreateSpaRoomDTO): Promise<SpaRoom> {
    requireId(payload.locationId, "Location");
    requireId(payload.roomNumber, "Room number");
    if (payload.sessionPrice === undefined) {
      requireId(payload.rateVariantId, "Room price");
    } else if (!(payload.sessionPrice >= 0)) {
      throw new Error("Room price must be zero or more");
    }
    if (payload.capacity < 1) throw new Error("Room capacity must be at least 1");
    if (payload.minimumMinutes < 1 || payload.incrementMinutes < 1) {
      throw new Error("Treatment length must be greater than zero");
    }
    return this.repository.createRoom(payload);
  }

  updateRoom(id: string, payload: UpdateSpaRoomDTO): Promise<SpaRoom> {
    requireId(id, "Room ID");
    return this.repository.updateRoom(id, payload);
  }

  deleteRoom(id: string): Promise<SpaRoom> {
    requireId(id, "Room ID");
    return this.repository.deleteRoom(id);
  }

  markRoomReady(id: string): Promise<SpaRoom> {
    requireId(id, "Room ID");
    return this.repository.markRoomReady(id);
  }

  openSession(payload: OpenSpaSessionDTO): Promise<SpaSession> {
    requireId(payload.roomId, "Room");
    if (payload.guestCount !== undefined && payload.guestCount < 1) {
      throw new Error("Guest count must be at least 1");
    }
    if (payload.plannedMinutes !== undefined && payload.plannedMinutes < 1) {
      throw new Error("Treatment length must be greater than zero");
    }
    return this.repository.openSession(payload);
  }

  getQuote(id: string): Promise<SpaSessionQuote> {
    requireId(id, "Session ID");
    return this.repository.getQuote(id);
  }

  pauseSession(id: string): Promise<SpaSession> {
    requireId(id, "Session ID");
    return this.repository.pauseSession(id);
  }

  resumeSession(id: string): Promise<SpaSession> {
    requireId(id, "Session ID");
    return this.repository.resumeSession(id);
  }

  extendSession(id: string, payload: ExtendSpaSessionDTO): Promise<SpaChargeResultDTO> {
    requireId(id, "Session ID");
    if (payload.sessions < 1) throw new Error("Add at least one session");
    return this.repository.extendSession(id, payload);
  }

  chargeItems(id: string, payload: ChargeSpaItemsDTO): Promise<SpaChargeResultDTO> {
    requireId(id, "Session ID");
    if (!payload.items.length) throw new Error("Nothing to charge");
    return this.repository.chargeItems(id, payload);
  }

  giveFree(id: string, payload: GiveFreeItemsDTO): Promise<SpaChargeResultDTO> {
    requireId(id, "Session ID");
    if (!payload.compReasonId && !payload.reason?.trim()) {
      throw new Error("FOC reason is required");
    }
    if (!payload.items.length) throw new Error("Nothing to give");
    return this.repository.giveFree(id, payload);
  }

  refundLine(id: string, lineId: string, reason?: string): Promise<SpaChargeResultDTO> {
    requireId(id, "Session ID");
    requireId(lineId, "Line ID");
    return this.repository.refundLine(id, lineId, reason);
  }

  closeSession(id: string, payload: CloseSpaSessionDTO): Promise<SpaSessionQuote> {
    requireId(id, "Session ID");
    return this.repository.closeSession(id, payload);
  }
}
