import { RoomOrderView } from "@/core/domain/entities/RoomTablet";
import { KitchenSlip } from "@/lib/printing/formatKdsTicket";

export const toTabletSlip = (order: RoomOrderView): KitchenSlip => ({
  title: `Room order ${order.orderNumber}`,
  place: `Room ${order.roomNumber}`,
  placeDetail: order.roomName && order.roomName !== order.roomNumber ? order.roomName : undefined,
  firedAt: order.createdAt,
  // A room order prints its items at bill height, not the kitchen's.
  room: true,
  sentBy: order.source === "TABLET" ? order.deviceName || "Room tablet" : undefined,
  lines: order.items.map((item) => ({
    name: item.name,
    quantity: String(item.quantity),
    // The category decides which KDS station prints the item.
    categoryId: item.categoryId || undefined,
  })),
});
