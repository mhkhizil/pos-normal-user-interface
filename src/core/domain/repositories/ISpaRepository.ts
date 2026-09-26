import {
  ChargeSpaItemsDTO,
  GiveFreeItemsDTO,
  CloseSpaSessionDTO,
  ExtendSpaSessionDTO,
  SpaChargeResultDTO,
  CreateSpaRoomDTO,
  OpenSpaSessionDTO,
  UpdateSpaRoomDTO,
} from "../../application/dtos/SpaDTO";
import { SpaRoom, SpaSession, SpaSessionQuote } from "../entities/Spa";

export interface ISpaRepository {
  getBoard(locationId?: string): Promise<SpaRoom[]>;
  createRoom(payload: CreateSpaRoomDTO): Promise<SpaRoom>;
  updateRoom(id: string, payload: UpdateSpaRoomDTO): Promise<SpaRoom>;
  deleteRoom(id: string): Promise<SpaRoom>;
  markRoomReady(id: string): Promise<SpaRoom>;
  openSession(payload: OpenSpaSessionDTO): Promise<SpaSession>;
  getQuote(id: string): Promise<SpaSessionQuote>;
  pauseSession(id: string): Promise<SpaSession>;
  resumeSession(id: string): Promise<SpaSession>;
  closeSession(id: string, payload: CloseSpaSessionDTO): Promise<SpaSessionQuote>;
  extendSession(id: string, payload: ExtendSpaSessionDTO): Promise<SpaChargeResultDTO>;
  chargeItems(id: string, payload: ChargeSpaItemsDTO): Promise<SpaChargeResultDTO>;
  giveFree(id: string, payload: GiveFreeItemsDTO): Promise<SpaChargeResultDTO>;
  refundLine(id: string, lineId: string, reason?: string): Promise<SpaChargeResultDTO>;
}
