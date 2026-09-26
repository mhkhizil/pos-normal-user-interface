export type VisitOrderStatus = "RECEIVED" | "PREPARING" | "READY" | "SERVED" | "REFUNDED";

export interface TabletGuest {
  displayName: string;
  tier: string;
  discountPercent: number;
  isPostpaid: boolean;
  balance: string;
}

export interface TabletVisitOrder {
  id: string;
  orderNumber: number;
  kind: "ITEMS" | "SESSIONS";
  source: "TABLET" | "STAFF";
  amount: string;
  placedAt: string;
  status: VisitOrderStatus;
  items: { name: string; quantity: number; refunded: boolean }[];
}

export interface TabletVisitRoom {
  kind: "SPA";
  sessionId: string;
  roomId: string;
  roomNumber: string;
  roomName: string | null;
  sessionState: string;
  openedAt: string;
  plannedMinutes: number | null;
  sessionMinutes: number;
  sessionPrice: string | null;
  endsAt: string | null;
  prepaid: boolean;
  spent: string;
  orders: TabletVisitOrder[];
}

export interface TabletVisit {
  guest: TabletGuest;
  rooms: TabletVisitRoom[];
}

export interface TabletHistoryEntry {
  type: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  at: string;
}

export interface TabletMenuItem {
  variantId: string;
  name: string;
  price: string;
  imageUrl: string | null;
}

export interface TabletMenuCategory {
  categoryId: string;
  name: string;
  items: TabletMenuItem[];
}

export interface TabletChargeResult {
  charged: string;
  balanceAfter: string;
  orderNumber: number | null;
}

export interface RoomOrderView {
  id: string;
  orderNumber: number;
  source: "TABLET" | "STAFF";
  kind: "ITEMS" | "SESSIONS";
  roomNumber: string;
  roomName: string | null;
  spaSessionId: string;
  amount: string;
  deviceName: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  deliveredAt: string | null;
  printClaimedAt: string | null;
  items: { name: string; quantity: number; status: string }[];
}

export interface TabletRoom {
  roomId: string;
  roomNumber: string;
  name: string | null;
  treatment: string | null;
  sessionMinutes: number;
  sessionPrice: string | null;
  status: "AVAILABLE" | "IN_USE" | "OCCUPIED" | "CLEANING" | "OUT_OF_SERVICE";
  available: boolean;
  endsAt: string | null;
}

export interface TabletStartResult {
  sessionId: string;
  charged: string;
  balanceAfter: string;
}
