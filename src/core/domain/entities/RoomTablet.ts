import type { ModifierGroup } from "./Cashier";
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

export type TabletRoomKind = "SPA" | "KTV";

export interface TabletVisitRoom {
  kind: TabletRoomKind;
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
  /** The product, for its options; missing from an older server. */
  productId?: string;
  name: string;
  price: string;
  imageUrl: string | null;
  /** Options to ask for; none adds the item with one tap. */
  modifierGroups: ModifierGroup[];
}

export interface TabletMenuCategory {
  categoryId: string;
  name: string;
  items: TabletMenuItem[];
}

export interface TabletMenu {
  categories: TabletMenuCategory[];
  /** Notes to tap onto an item ("No ice"), in order. */
  quickNotes: string[];
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
  items: {
    name: string;
    quantity: number;
    status: string;
    /** The menu category, so the ticket prints at that category's station. */
    categoryId?: string | null;
  }[];
}

export interface TabletRoom {
  kind: TabletRoomKind;
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
