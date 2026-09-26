import { RoomOrderView } from "@/core/domain/entities/RoomTablet";
import { KitchenSlip } from "@/lib/printing/formatKdsTicket";

export const toTabletSlip = (order: RoomOrderView): KitchenSlip => ({
  title: `Room ${order.roomNumber} · #${order.orderNumber}`,
  firedAt: order.createdAt,
  orderRef: order.deviceName || "Room tablet",
  lines: order.items.map((item) => ({
    name: item.name,
    quantity: String(item.quantity),
  })),
});
