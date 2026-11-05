/** One item a tablet orders: its options as ids (the server prices them) and a note. */
export interface TabletChargeItemDTO {
  variantId: string;
  quantity: number;
  selectedModifiers?: { modifierId: string }[];
  note?: string;
}

export interface TabletOrderDTO {
  cardUid: string;
  sessionId: string;
  items: TabletChargeItemDTO[];
  idempotencyKey: string;
  deviceName?: string;
}

export interface TabletExtendDTO {
  cardUid: string;
  sessionId: string;
  sessions: number;
  idempotencyKey: string;
  deviceName?: string;
}

export interface TabletStartDTO {
  cardUid: string;
  roomId: string;
  sessions: number;
  guestCount?: number;
  items?: TabletChargeItemDTO[];
  idempotencyKey: string;
  deviceName?: string;
}
