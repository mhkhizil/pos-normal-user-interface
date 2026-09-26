export interface TabletOrderDTO {
  cardUid: string;
  sessionId: string;
  items: { variantId: string; quantity: number }[];
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
