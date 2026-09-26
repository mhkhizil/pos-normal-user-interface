import { TabletExtendDTO, TabletOrderDTO, TabletStartDTO } from "../dtos/RoomTabletDTO";
import {
  RoomOrderView,
  TabletChargeResult,
  TabletHistoryEntry,
  TabletMenuCategory,
  TabletRoom,
  TabletStartResult,
  TabletVisit,
} from "../../domain/entities/RoomTablet";
import { IRoomTabletRepository } from "../../domain/repositories/IRoomTabletRepository";
import { IRoomTabletService } from "../../domain/services/IRoomTabletService";

const requireValue = (value: string, label: string) => {
  if (!value?.trim()) throw new Error(`${label} is required`);
};

export class RoomTabletService implements IRoomTabletService {
  constructor(private repository: IRoomTabletRepository) {}

  getVisit(cardUid: string): Promise<TabletVisit> {
    requireValue(cardUid, "Card");
    return this.repository.getVisit(cardUid.trim());
  }

  getHistory(cardUid: string): Promise<TabletHistoryEntry[]> {
    requireValue(cardUid, "Card");
    return this.repository.getHistory(cardUid.trim());
  }

  getMenu(): Promise<TabletMenuCategory[]> {
    return this.repository.getMenu();
  }

  getRooms(): Promise<TabletRoom[]> {
    return this.repository.getRooms();
  }

  startRoom(payload: TabletStartDTO): Promise<TabletStartResult> {
    requireValue(payload.cardUid, "Card");
    requireValue(payload.roomId, "Room");
    if (payload.sessions < 1) throw new Error("Choose at least one session");
    return this.repository.startRoom({ ...payload, cardUid: payload.cardUid.trim() });
  }

  placeOrder(payload: TabletOrderDTO): Promise<TabletChargeResult> {
    requireValue(payload.cardUid, "Card");
    if (!payload.items.length) throw new Error("The order is empty");
    return this.repository.placeOrder({ ...payload, cardUid: payload.cardUid.trim() });
  }

  addTime(payload: TabletExtendDTO): Promise<TabletChargeResult> {
    requireValue(payload.cardUid, "Card");
    if (payload.sessions < 1) throw new Error("Add at least one session");
    return this.repository.addTime({ ...payload, cardUid: payload.cardUid.trim() });
  }

  listRoomOrders(pendingOnly: boolean): Promise<RoomOrderView[]> {
    return this.repository.listRoomOrders(pendingOnly);
  }

  acknowledgeRoomOrder(id: string): Promise<RoomOrderView> {
    requireValue(id, "Order");
    return this.repository.acknowledgeRoomOrder(id);
  }

  deliverRoomOrder(id: string): Promise<RoomOrderView> {
    requireValue(id, "Order");
    return this.repository.deliverRoomOrder(id);
  }

  claimRoomOrderPrint(id: string): Promise<{ claimed: boolean; order: RoomOrderView }> {
    requireValue(id, "Order");
    return this.repository.claimRoomOrderPrint(id);
  }
}
