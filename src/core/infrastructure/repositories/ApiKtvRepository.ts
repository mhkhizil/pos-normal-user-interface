import { toModifierGroups } from "./ApiCashierRepository";
import {
  ChargeKtvItemsDTO,
  CloseKtvSessionDTO,
  CreateKtvRoomDTO,
  ExtendKtvSessionDTO,
  KtvChargeResultDTO,
  KtvRoomFilterDTO,
  KtvRoomListDTO,
  OpenKtvSessionDTO,
  UpdateKtvRoomDTO,
} from "../../application/dtos/KtvDTO";
import { GiveFreeItemsDTO } from "../../application/dtos/SpaDTO";
import {
  KtvQuoteSegment,
  KtvRoom,
  KtvSession,
  KtvSessionQuote,
  RoomTabletMenu,
  RoomTabletMenuCategory,
  RoomTabletMenuItem,
  RoomTabletOrderLine,
  RoomTabletSession,
} from "../../domain/entities/Ktv";
import { IKtvRepository } from "../../domain/repositories/IKtvRepository";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";
import { parseCashier } from "@/lib/printing/cashier";

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

const toSession = (value: unknown, roomId?: string) => {
  const item = asRecord(value);
  return new KtvSession({
    id: String(item.id || ""),
    tenantId: item.tenantId ? String(item.tenantId) : undefined,
    roomId: item.roomId ? String(item.roomId) : roomId,
    guestWalletId: item.guestWalletId
      ? String(item.guestWalletId)
      : undefined,
    hostUserId: item.hostUserId ? String(item.hostUserId) : undefined,
    guestCount: Number(item.guestCount || 0),
    openedAt: String(item.openedAt || ""),
    closedAt: item.closedAt ? String(item.closedAt) : null,
    pausedMinutes: Number(item.pausedMinutes || 0),
    pausedAt: item.pausedAt ? String(item.pausedAt) : null,
    salesOrderId: item.salesOrderId ? String(item.salesOrderId) : undefined,
    sessionState: String(item.sessionState || item.state || "OPEN") as KtvSession["sessionState"],
    posRegisterId: item.posRegisterId ? String(item.posRegisterId) : undefined,
    openedByPosSessionId: item.openedByPosSessionId
      ? String(item.openedByPosSessionId)
      : undefined,
    minimumMinutesSnapshot:
      item.minimumMinutesSnapshot == null
        ? undefined
        : Number(item.minimumMinutesSnapshot),
    incrementMinutesSnapshot:
      item.incrementMinutesSnapshot == null
        ? undefined
        : Number(item.incrementMinutesSnapshot),
    graceMinutesSnapshot:
      item.graceMinutesSnapshot == null
        ? undefined
        : Number(item.graceMinutesSnapshot),
    roundingModeSnapshot: item.roundingModeSnapshot
      ? (String(item.roundingModeSnapshot) as KtvSession["roundingModeSnapshot"])
      : undefined,
    plannedMinutes:
      item.plannedMinutes == null ? undefined : Number(item.plannedMinutes),
    endsAt: item.endsAt ? String(item.endsAt) : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  });
};

const toRoom = (value: unknown) => {
  const item = asRecord(value);
  const roomId = String(item.id || "");
  return new KtvRoom({
    id: roomId,
    tenantId: String(item.tenantId || ""),
    locationId: String(item.locationId || ""),
    roomNumber: String(item.roomNumber || ""),
    name: String(item.name || ""),
    capacity: Number(item.capacity || 0),
    rateVariantId: String(item.rateVariantId || ""),
    sessionPrice: item.sessionPrice == null ? undefined : Number(item.sessionPrice),
    priceNow: item.priceNow == null ? undefined : Number(item.priceNow),
    rateLabel: item.rateLabel ? String(item.rateLabel) : undefined,
    rateProductId: item.rateProductId ? String(item.rateProductId) : undefined,
    minimumMinutes: Number(item.minimumMinutes || 0),
    incrementMinutes: Number(item.incrementMinutes || 0),
    graceMinutes: Number(item.graceMinutes || 0),
    roundingMode: String(item.roundingMode || "UP") as KtvRoom["roundingMode"],
    status: String(item.status || "AVAILABLE") as KtvRoom["status"],
    deletedAt: item.deletedAt ? String(item.deletedAt) : null,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
    sessions: Array.isArray(item.sessions)
      ? item.sessions.map((session) => toSession(session, roomId))
      : [],
  });
};

const toQuote = (value: unknown) => {
  const item = asRecord(value);
  return new KtvSessionQuote({
    sessionId: String(item.sessionId || ""),
    roomId: String(item.roomId || ""),
    roomNumber: String(item.roomNumber || ""),
    state: String(item.state || "OPEN") as KtvSessionQuote["state"],
    openedAt: String(item.openedAt || ""),
    asOf: String(item.asOf || ""),
    elapsedMinutes: Number(item.elapsedMinutes || 0),
    pausedMinutes: Number(item.pausedMinutes || 0),
    segments: Array.isArray(item.segments)
      ? item.segments.map((segment) => {
          const row = asRecord(segment);
          return new KtvQuoteSegment({
            label: String(row.label || ""),
            from: String(row.from || ""),
            to: String(row.to || ""),
            minutes: Number(row.minutes || 0),
            billableMinutes: Number(row.billableMinutes || 0),
            hours: String(row.hours || "0.0000"),
            rate: String(row.rate || "0.0000"),
            amount: String(row.amount || "0.0000"),
          });
        })
      : [],
    roomCharge: String(item.roomCharge || "0.0000"),
    fnbCharge: String(item.fnbCharge || "0.0000"),
    runningTotal: String(item.runningTotal || "0.0000"),
    prepaid: Boolean(item.prepaid),
    paidTotal: String(item.paidTotal || "0.0000"),
    paymentTiming:
      item.paymentTiming === "PAY_AT_END" || item.paymentTiming === "PAY_WHEN_ORDERING"
        ? item.paymentTiming
        : null,
    amountDue: String(item.amountDue || "0.0000"),
    cashier: parseCashier(item.cashier),
    orderNumber: item.orderNumber ? String(item.orderNumber) : null,
  });
};

const toChargeResult = (value: unknown): KtvChargeResultDTO => {
  const item = asRecord(value);
  return {
    charged: String(item.charged || "0.0000"),
    balanceAfter: String(item.balanceAfter || "0.0000"),
    quote: toQuote(item.quote),
  };
};

const toRoomTabletMenu = (value: unknown) => {
  const item = asRecord(value);
  return new RoomTabletMenu({
    roomNumber: String(item.roomNumber || ""),
    quickNotes: Array.isArray(item.quickNotes) ? item.quickNotes.map(String) : [],
    categories: Array.isArray(item.categories)
      ? item.categories.map((category) => {
          const row = asRecord(category);
          return new RoomTabletMenuCategory({
            categoryId: String(row.categoryId || ""),
            name: String(row.name || ""),
            items: Array.isArray(row.items)
              ? row.items.map((menuItem) => {
                  const menuRow = asRecord(menuItem);
                  return new RoomTabletMenuItem({
                    variantId: String(menuRow.variantId || ""),
                    productId: menuRow.productId ? String(menuRow.productId) : undefined,
                    modifierGroups: toModifierGroups(menuRow.modifierGroups),
                    name: String(menuRow.name || ""),
                    price: String(menuRow.price || "0.0000"),
                    imageUrl: menuRow.imageUrl
                      ? String(menuRow.imageUrl)
                      : undefined,
                  });
                })
              : [],
          });
        })
      : [],
  });
};

const toRoomTabletSession = (value: unknown) => {
  const item = asRecord(value);
  return new RoomTabletSession({
    roomNumber: String(item.roomNumber || ""),
    guestCount: Number(item.guestCount || 0),
    openedAt: String(item.openedAt || ""),
    endsAt: String(item.endsAt || ""),
    sessionState: String(
      item.sessionState || "OPEN"
    ) as RoomTabletSession["sessionState"],
    lines: Array.isArray(item.lines)
      ? item.lines.map((line) => {
          const row = asRecord(line);
          return new RoomTabletOrderLine({
            name: String(row.name || ""),
            quantity: String(row.quantity || "0.0000"),
            unitPrice: String(row.unitPrice || "0.0000"),
            lineTotal: String(row.lineTotal || "0.0000"),
            status: String(row.status || "PENDING"),
          });
        })
      : [],
    fnbTotal: String(item.fnbTotal || "0.0000"),
    walletBalance: String(item.walletBalance || "0.0000"),
  });
};

export class ApiKtvRepository implements IKtvRepository {
  constructor(private httpClient: HttpClient) {}

  async listRooms(params?: KtvRoomFilterDTO): Promise<KtvRoomListDTO> {
    const response = await this.httpClient.get<ApiEnvelope<unknown[]>>(
      API_ENDPOINTS.KTV_ROOMS.LIST,
      { params }
    );
    const value = unwrap(response);
    const rooms = (Array.isArray(value) ? value : []).map(toRoom);
    const meta =
      response && typeof response === "object" && "meta" in response
        ? response.meta || {}
        : {};
    const limit = Number(meta.limit || params?.limit || 10);
    const total = Number(meta.total ?? rooms.length);
    return {
      rooms,
      total,
      page: Number(meta.page || params?.page || 1),
      limit,
      totalPages: Number(
        meta.totalPages || Math.max(1, Math.ceil(total / Math.max(1, limit)))
      ),
    };
  }

  async getBoard(): Promise<KtvRoom[]> {
    const response = await this.httpClient.get<ApiEnvelope<unknown[]>>(
      API_ENDPOINTS.KTV_ROOMS.BOARD
    );
    const value = unwrap(response);
    return (Array.isArray(value) ? value : []).map(toRoom);
  }

  async getRoom(id: string): Promise<KtvRoom> {
    const response = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_ROOMS.BY_ID(id)
    );
    return toRoom(unwrap(response));
  }

  async createRoom(payload: CreateKtvRoomDTO): Promise<KtvRoom> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_ROOMS.CREATE,
      payload
    );
    return toRoom(unwrap(response));
  }

  async updateRoom(
    id: string,
    payload: UpdateKtvRoomDTO
  ): Promise<KtvRoom> {
    const response = await this.httpClient.patch<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_ROOMS.UPDATE(id),
      payload
    );
    return toRoom(unwrap(response));
  }

  async deleteRoom(id: string): Promise<KtvRoom> {
    const response = await this.httpClient.delete<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_ROOMS.DELETE(id)
    );
    return toRoom(unwrap(response));
  }

  async markRoomReady(id: string): Promise<KtvRoom> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_ROOMS.READY(id)
    );
    return toRoom(unwrap(response));
  }

  async openSession(payload: OpenKtvSessionDTO): Promise<KtvSession> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.CREATE,
      payload
    );
    return toSession(unwrap(response), payload.roomId);
  }

  async getQuote(id: string): Promise<KtvSessionQuote> {
    const response = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.QUOTE(id)
    );
    return toQuote(unwrap(response));
  }

  async pauseSession(id: string): Promise<KtvSession> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.PAUSE(id)
    );
    return toSession(unwrap(response));
  }

  async resumeSession(id: string): Promise<KtvSession> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.RESUME(id)
    );
    return toSession(unwrap(response));
  }

  async closeSession(
    id: string,
    payload: CloseKtvSessionDTO
  ): Promise<KtvSessionQuote> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.CLOSE(id),
      payload
    );
    return toQuote(unwrap(response));
  }

  async extendSession(id: string, payload: ExtendKtvSessionDTO): Promise<KtvChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.EXTEND(id),
      payload
    );
    return toChargeResult(unwrap(response));
  }

  async chargeItems(id: string, payload: ChargeKtvItemsDTO): Promise<KtvChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.CHARGES(id),
      payload
    );
    return toChargeResult(unwrap(response));
  }

  async giveFree(id: string, payload: GiveFreeItemsDTO): Promise<KtvChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.FOC(id),
      payload
    );
    return toChargeResult(unwrap(response));
  }

  async refundLine(
    id: string,
    lineId: string,
    reason?: string,
    approverToken?: string
  ): Promise<KtvChargeResultDTO> {
    const response = await this.httpClient.post<ApiEnvelope<unknown>>(
      API_ENDPOINTS.KTV_SESSIONS.REFUND_LINE(id, lineId),
      reason ? { reason } : {},
      approverToken ? { headers: { "x-approver-authorization": approverToken } } : undefined
    );
    return toChargeResult(unwrap(response));
  }

  async getRoomTabletMenu(): Promise<RoomTabletMenu> {
    const response = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.ROOM_TABLET.MENU
    );
    return toRoomTabletMenu(unwrap(response));
  }

  async getRoomTabletSession(): Promise<RoomTabletSession> {
    const response = await this.httpClient.get<ApiEnvelope<unknown>>(
      API_ENDPOINTS.ROOM_TABLET.SESSION
    );
    return toRoomTabletSession(unwrap(response));
  }
}
