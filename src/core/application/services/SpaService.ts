import {
  CloseSpaSessionDTO,
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
    requireId(payload.rateVariantId, "Treatment rate variant");
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

  closeSession(id: string, payload: CloseSpaSessionDTO): Promise<SpaSessionQuote> {
    requireId(id, "Session ID");
    return this.repository.closeSession(id, payload);
  }
}
