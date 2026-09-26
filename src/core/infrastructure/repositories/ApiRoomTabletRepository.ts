import { TabletExtendDTO, TabletOrderDTO } from "../../application/dtos/RoomTabletDTO";
import {
  RoomOrderView,
  TabletChargeResult,
  TabletHistoryEntry,
  TabletMenuCategory,
  TabletVisit,
  TabletVisitOrder,
  TabletVisitRoom,
} from "../../domain/entities/RoomTablet";
import { IRoomTabletRepository } from "../../domain/repositories/IRoomTabletRepository";
import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";

type RecordValue = Record<string, unknown>;

const asRecord = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const unwrap = (response: unknown): unknown => {
  if (response && typeof response === "object" && "data" in response) {
    return unwrap((response as RecordValue).data);
  }
  return response;
};

const text = (value: unknown, fallback = "") => (value == null ? fallback : String(value));
const money = (value: unknown) => text(value, "0.0000");
const orNull = (value: unknown) => (value == null ? null : String(value));

const toOrder = (value: unknown): TabletVisitOrder => {
  const item = asRecord(value);
  return {
    id: text(item.id),
    orderNumber: Number(item.orderNumber || 0),
    kind: text(item.kind, "ITEMS") as TabletVisitOrder["kind"],
    source: text(item.source, "TABLET") as TabletVisitOrder["source"],
    amount: money(item.amount),
    placedAt: text(item.placedAt),
    status: text(item.status, "RECEIVED") as TabletVisitOrder["status"],
    items: asList(item.items).map((entry) => {
      const line = asRecord(entry);
      return {
        name: text(line.name),
        quantity: Number(line.quantity || 0),
        refunded: Boolean(line.refunded),
      };
    }),
  };
};

const toRoom = (value: unknown): TabletVisitRoom => {
  const item = asRecord(value);
  return {
    kind: "SPA",
    sessionId: text(item.sessionId),
    roomId: text(item.roomId),
    roomNumber: text(item.roomNumber),
    roomName: orNull(item.roomName),
    sessionState: text(item.sessionState, "OPEN"),
    openedAt: text(item.openedAt),
    plannedMinutes: item.plannedMinutes == null ? null : Number(item.plannedMinutes),
    sessionMinutes: Number(item.sessionMinutes || 60),
    sessionPrice: orNull(item.sessionPrice),
    endsAt: orNull(item.endsAt),
    prepaid: Boolean(item.prepaid),
    spent: money(item.spent),
    orders: asList(item.orders).map(toOrder),
  };
};

const toRoomOrder = (value: unknown): RoomOrderView => {
  const item = asRecord(value);
  return {
    id: text(item.id),
    orderNumber: Number(item.orderNumber || 0),
    source: text(item.source, "TABLET") as RoomOrderView["source"],
    kind: text(item.kind, "ITEMS") as RoomOrderView["kind"],
    roomNumber: text(item.roomNumber),
    roomName: orNull(item.roomName),
    spaSessionId: text(item.spaSessionId),
    amount: money(item.amount),
    deviceName: orNull(item.deviceName),
    createdAt: text(item.createdAt),
    acknowledgedAt: orNull(item.acknowledgedAt),
    deliveredAt: orNull(item.deliveredAt),
    printClaimedAt: orNull(item.printClaimedAt),
    items: asList(item.items).map((entry) => {
      const line = asRecord(entry);
      return {
        name: text(line.name),
        quantity: Number(line.quantity || 0),
        status: text(line.status, "PENDING"),
      };
    }),
  };
};

const toCharge = (value: unknown): TabletChargeResult => {
  const item = asRecord(value);
  return {
    charged: money(item.charged),
    balanceAfter: money(item.balanceAfter),
    orderNumber: item.orderNumber == null ? null : Number(item.orderNumber),
  };
};

export class ApiRoomTabletRepository implements IRoomTabletRepository {
  constructor(private httpClient: HttpClient) {}

  async getVisit(cardUid: string): Promise<TabletVisit> {
    const response = await this.httpClient.post<unknown>(API_ENDPOINTS.TABLET.VISIT, { cardUid });
    const item = asRecord(unwrap(response));
    const guest = asRecord(item.guest);
    return {
      guest: {
        displayName: text(guest.displayName),
        tier: text(guest.tier),
        discountPercent: Number(guest.discountPercent || 0),
        isPostpaid: Boolean(guest.isPostpaid),
        balance: money(guest.balance),
      },
      rooms: asList(item.rooms).map(toRoom),
    };
  }

  async getHistory(cardUid: string): Promise<TabletHistoryEntry[]> {
    const response = await this.httpClient.post<unknown>(API_ENDPOINTS.TABLET.HISTORY, { cardUid });
    return asList(unwrap(response)).map((value) => {
      const item = asRecord(value);
      return {
        type: text(item.type),
        amount: money(item.amount),
        balanceAfter: money(item.balanceAfter),
        note: orNull(item.note),
        at: text(item.at),
      };
    });
  }

  async getMenu(): Promise<TabletMenuCategory[]> {
    const response = await this.httpClient.get<unknown>(API_ENDPOINTS.TABLET.MENU);
    return asList(asRecord(unwrap(response)).categories).map((value) => {
      const category = asRecord(value);
      return {
        categoryId: text(category.categoryId),
        name: text(category.name),
        items: asList(category.items).map((entry) => {
          const item = asRecord(entry);
          return {
            variantId: text(item.variantId),
            name: text(item.name),
            price: money(item.price),
            imageUrl: orNull(item.imageUrl),
          };
        }),
      };
    });
  }

  async placeOrder(payload: TabletOrderDTO): Promise<TabletChargeResult> {
    return toCharge(unwrap(await this.httpClient.post<unknown>(API_ENDPOINTS.TABLET.ORDERS, payload)));
  }

  async addTime(payload: TabletExtendDTO): Promise<TabletChargeResult> {
    return toCharge(unwrap(await this.httpClient.post<unknown>(API_ENDPOINTS.TABLET.EXTEND, payload)));
  }

  async listRoomOrders(pendingOnly: boolean): Promise<RoomOrderView[]> {
    const response = await this.httpClient.get<unknown>(API_ENDPOINTS.ROOM_ORDERS.LIST, {
      params: pendingOnly ? { pending: true } : undefined,
    });
    return asList(unwrap(response)).map(toRoomOrder);
  }

  async acknowledgeRoomOrder(id: string): Promise<RoomOrderView> {
    return toRoomOrder(unwrap(await this.httpClient.post<unknown>(API_ENDPOINTS.ROOM_ORDERS.ACKNOWLEDGE(id))));
  }

  async deliverRoomOrder(id: string): Promise<RoomOrderView> {
    return toRoomOrder(unwrap(await this.httpClient.post<unknown>(API_ENDPOINTS.ROOM_ORDERS.DELIVER(id))));
  }

  async claimRoomOrderPrint(id: string): Promise<{ claimed: boolean; order: RoomOrderView }> {
    const item = asRecord(
      unwrap(await this.httpClient.post<unknown>(API_ENDPOINTS.ROOM_ORDERS.CLAIM_PRINT(id)))
    );
    return { claimed: Boolean(item.claimed), order: toRoomOrder(item.order) };
  }
}
