import { TabletExtendDTO, TabletOrderDTO } from "../../application/dtos/RoomTabletDTO";
import {
  RoomOrderView,
  TabletChargeResult,
  TabletHistoryEntry,
  TabletMenuCategory,
  TabletVisit,
} from "../entities/RoomTablet";

export interface IRoomTabletRepository {
  getVisit(cardUid: string): Promise<TabletVisit>;
  getHistory(cardUid: string): Promise<TabletHistoryEntry[]>;
  getMenu(): Promise<TabletMenuCategory[]>;
  placeOrder(payload: TabletOrderDTO): Promise<TabletChargeResult>;
  addTime(payload: TabletExtendDTO): Promise<TabletChargeResult>;
  listRoomOrders(pendingOnly: boolean): Promise<RoomOrderView[]>;
  acknowledgeRoomOrder(id: string): Promise<RoomOrderView>;
  deliverRoomOrder(id: string): Promise<RoomOrderView>;
  claimRoomOrderPrint(id: string): Promise<{ claimed: boolean; order: RoomOrderView }>;
}
