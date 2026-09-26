import {
  ChargeSpaItemsDTO,
  CloseSpaSessionDTO,
  ExtendSpaSessionDTO,
  SpaChargeResultDTO,
  CreateSpaRoomDTO,
  OpenSpaSessionDTO,
  UpdateSpaRoomDTO,
} from "../../application/dtos/SpaDTO";
import {
  SpaQuoteSegment,
  SpaRoom,
  SpaSession,
  SpaSessionQuote,
} from "../../domain/entities/Spa";
import { ISpaRepository } from "../../domain/repositories/ISpaRepository";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";

type RecordValue = Record<string, unknown>;

interface ApiEnvelope<T> {
  data?: T;
  meta?: RecordValue;
}

const asRecord = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};

const unwrap = <T>(response: ApiEnvelope<T> | T): T => {
  if (response && typeof response === "object" && "data" in response) {
    return unwrap((response as ApiEnvelope<T>).data as T);
  }
  return response as T;
};

const optionalString = (value: unknown) => (value ? String(value) : undefined);

const toSession = (value: unknown, roomId?: string) => {
  const item = asRecord(value);
  return new SpaSession({
    id: String(item.id || ""),
    tenantId: optionalString(item.tenantId),
    roomId: item.roomId ? String(item.roomId) : roomId,
    guestWalletId: optionalString(item.guestWalletId),
    guestCount: Number(item.guestCount || 1),
    openedAt: String(item.openedAt || ""),
    closedAt: item.closedAt ? String(item.closedAt) : null,
    pausedMinutes: Number(item.pausedMinutes || 0),
    pausedAt: item.pausedAt ? String(item.pausedAt) : null,
    salesOrderId: optionalString(item.salesOrderId),
    sessionState: String(
      item.sessionState || item.state || "OPEN"
    ) as SpaSession["sessionState"],
    posRegisterId: optionalString(item.posRegisterId),
    openedByPosSessionId: optionalString(item.openedByPosSessionId),
    plannedMinutes:
      item.plannedMinutes == null ? undefined : Number(item.plannedMinutes),
    endsAt: optionalString(item.endsAt),
    createdAt: optionalString(item.createdAt),
    updatedAt: optionalString(item.updatedAt),
  });
};

const toRoom = (value: unknown) => {
  const item = asRecord(value);
  const roomId = String(item.id || "");
  return new SpaRoom({
    id: roomId,
    tenantId: String(item.tenantId || ""),
    locationId: String(item.locationId || ""),
    roomNumber: String(item.roomNumber || ""),
    name: String(item.name || ""),
    capacity: Number(item.capacity || 1),
    rateVariantId: String(item.rateVariantId || ""),
    sessionPrice: item.sessionPrice == null ? undefined : Number(item.sessionPrice),
    rateProductId: optionalString(item.rateProductId),
    minimumMinutes: Number(item.minimumMinutes || 0),
    incrementMinutes: Number(item.incrementMinutes || 0),
    graceMinutes: Number(item.graceMinutes || 0),
    roundingMode: String(item.roundingMode || "DOWN") as SpaRoom["roundingMode"],
    status: String(item.status || "AVAILABLE") as SpaRoom["status"],
    deletedAt: item.deletedAt ? String(item.deletedAt) : null,
    createdAt: optionalString(item.createdAt),
    updatedAt: optionalString(item.updatedAt),
    sessions: Array.isArray(item.sessions)
      ? item.sessions.map((session) => toSession(session, roomId))
      : [],
  });
};

const toQuote = (value: unknown) => {
  const item = asRecord(value);
  return new SpaSessionQuote({
    sessionId: String(item.sessionId || ""),
    roomId: String(item.roomId || ""),
    roomNumber: String(item.roomNumber || ""),
    state: String(item.state || "OPEN") as SpaSessionQuote["state"],
    openedAt: String(item.openedAt || ""),
    asOf: String(item.asOf || ""),
    elapsedMinutes: Number(item.elapsedMinutes || 0),
    pausedMinutes: Number(item.pausedMinutes || 0),
    segments: Array.isArray(item.segments)
      ? item.segments.map((segment) => {
          const row = asRecord(segment);
          return new SpaQuoteSegment({
            label: String(row.label || ""),
            from: String(row.from || ""),
            to: String(row.to || ""),
            minutes: Number(row.minutes || 0),
            billableMinutes: Number(row.billableMinutes || 0),
            hours: String(row.hours || "0.0000"),
            treatments: String(row.treatments || "0.0000"),
            rate: String(row.rate || "0.0000"),
            amount: String(row.amount || "0.0000"),
          });
        })
      : [],
    treatmentCharge: String(item.treatmentCharge || "0.0000"),
    servicesCharge: String(item.servicesCharge || "0.0000"),
    runningTotal: String(item.runningTotal || "0.0000"),
    prepaid: Boolean(item.prepaid),
    paidTotal: String(item.paidTotal || "0.0000"),
  });
};

const toChargeResult = (value: unknown): SpaChargeResultDTO => {
  const item = asRecord(value);
  return {
    charged: String(item.charged || "0.0000"),
    balanceAfter: String(item.balanceAfter || "0.0000"),
    quote: toQuote(item.quote),
  };
};

export class ApiSpaRepository implements ISpaRepository {
  constructor(private httpClient: HttpClient) {}

  async getBoard(locationId?: string): Promise<SpaRoom[]> {
    const response = await this.httpClient.get<ApiEnvelope<unknown[]>>(
      API_ENDPOINTS.SPA_ROOMS.BOARD,
      locationId ? { params: { locationId } } : undefined
    );
    const value = unwrap(response);
    return (Array.isArray(value) ? value : []).map(toRoom);
  }

  async createRoom(payload: CreateSpaRoomDTO): Promise<SpaRoom> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_ROOMS.CREATE,
      payload
    );
    return toRoom(unwrap(response));
  }

  async updateRoom(id: string, payload: UpdateSpaRoomDTO): Promise<SpaRoom> {
    const response = await this.httpClient.patch<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_ROOMS.UPDATE(id),
      payload
    );
    return toRoom(unwrap(response));
  }

  async deleteRoom(id: string): Promise<SpaRoom> {
    const response = await this.httpClient.delete<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_ROOMS.DELETE(id)
    );
    return toRoom(unwrap(response));
  }

  async markRoomReady(id: string): Promise<SpaRoom> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_ROOMS.READY(id)
    );
    return toRoom(unwrap(response));
  }

  async openSession(payload: OpenSpaSessionDTO): Promise<SpaSession> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.CREATE,
      payload
    );
    return toSession(unwrap(response), payload.roomId);
  }

  async getQuote(id: string): Promise<SpaSessionQuote> {
    const response = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.QUOTE(id)
    );
    return toQuote(unwrap(response));
  }

  async pauseSession(id: string): Promise<SpaSession> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.PAUSE(id)
    );
    return toSession(unwrap(response));
  }

  async resumeSession(id: string): Promise<SpaSession> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.RESUME(id)
    );
    return toSession(unwrap(response));
  }

  async extendSession(id: string, payload: ExtendSpaSessionDTO): Promise<SpaChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.EXTEND(id),
      payload
    );
    return toChargeResult(unwrap(response));
  }

  async chargeItems(id: string, payload: ChargeSpaItemsDTO): Promise<SpaChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.CHARGES(id),
      payload
    );
    return toChargeResult(unwrap(response));
  }

  async refundLine(id: string, lineId: string, reason?: string): Promise<SpaChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.REFUND_LINE(id, lineId),
      reason ? { reason } : {}
    );
    return toChargeResult(unwrap(response));
  }

  async closeSession(
    id: string,
    payload: CloseSpaSessionDTO
  ): Promise<SpaSessionQuote> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.SPA_SESSIONS.CLOSE(id),
      payload
    );
    return toQuote(unwrap(response));
  }
}
