import type { ChosenModifier } from "@/core/domain/entities/Cashier";
import { modifierKey, modifierRefs } from "@/lib/modifiers/choices";

export interface PendingItem {
  variantId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  foc?: boolean;
  /**
   * The hostess who gives it, for a KTV service that asks who served; on a menu
   * item, the hostess who ordered it.
   */
  hostessId?: string;
  hostessName?: string;
  /** A service a hostess gives: its hostess is fixed, not who ordered it. */
  service?: boolean;
  /** The options picked; unitPrice already includes what they add. */
  modifiers?: ChosenModifier[];
  /** A note for the kitchen or bar. */
  note?: string;
}

type PendingIdentity = Pick<PendingItem, "variantId" | "foc" | "hostessId" | "modifiers" | "note">;

/**
 * One row per item, hostess, options, note and paid-or-free, so two hostesses
 * or two different notes never merge.
 */
export const pendingKey = (item: PendingIdentity): string =>
  [
    item.variantId,
    item.hostessId,
    modifierKey(item.modifiers),
    item.note ? `note=${item.note}` : "",
    item.foc ? "foc" : "",
  ]
    .filter(Boolean)
    .join(":");

export const addPending = (
  items: PendingItem[],
  item: Omit<PendingItem, "quantity" | "foc">,
  quantity = 1
): PendingItem[] => {
  const existing = items.find(
    (entry) => !entry.foc && pendingKey(entry) === pendingKey({ ...item, foc: false })
  );
  if (existing) {
    return items.map((entry) =>
      entry === existing ? { ...entry, quantity: entry.quantity + quantity } : entry
    );
  }
  return [...items, { ...item, quantity }];
};

export const changePending = (
  items: PendingItem[],
  key: string,
  delta: number
): PendingItem[] =>
  items
    .map((entry) =>
      pendingKey(entry) === key ? { ...entry, quantity: entry.quantity + delta } : entry
    )
    .filter((entry) => entry.quantity > 0);

/** Says who ordered a row: a hostess, or the customer when none. Rows that end up alike merge. */
export const setOrderedBy = (
  items: PendingItem[],
  key: string,
  hostess?: { id: string; name: string }
): PendingItem[] => {
  const source = items.find((entry) => pendingKey(entry) === key);
  if (!source || source.service) return items;
  const moved = { ...source, hostessId: hostess?.id, hostessName: hostess?.name };
  const twin = items.find((entry) => entry !== source && pendingKey(entry) === pendingKey(moved));
  if (!twin) return items.map((entry) => (entry === source ? moved : entry));
  return items
    .filter((entry) => entry !== source)
    .map((entry) => (entry === twin ? { ...entry, quantity: entry.quantity + source.quantity } : entry));
};

/** Moves one of a row between paid and free, so a round of three can have one on the house. */
export const toggleOneFoc = (items: PendingItem[], key: string): PendingItem[] => {
  const source = items.find((entry) => pendingKey(entry) === key);
  if (!source) return items;
  const target = { ...source, foc: !source.foc };
  const withTarget = items.some((entry) => pendingKey(entry) === pendingKey(target))
    ? changePending(items, pendingKey(target), 1)
    : [...items, { ...target, quantity: 1 }];
  return changePending(withTarget, key, -1);
};

export const paidPending = (items: PendingItem[]): PendingItem[] =>
  items.filter((entry) => !entry.foc);

export const focPending = (items: PendingItem[]): PendingItem[] =>
  items.filter((entry) => entry.foc);

export const pendingTotal = (items: PendingItem[]): number =>
  paidPending(items).reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);

/** What running promotions take off the items still to pay for. Free items get none. */
export const pendingSaving = (
  items: PendingItem[],
  discounts: Record<string, { discount: number }>
): number =>
  paidPending(items).reduce((sum, entry) => sum + (discounts[entry.variantId]?.discount || 0), 0);

/** Gives a row its note; rows that end up alike merge. */
export const setPendingNote = (items: PendingItem[], key: string, note?: string): PendingItem[] => {
  const source = items.find((entry) => pendingKey(entry) === key);
  if (!source) return items;
  const moved = { ...source, note: note || undefined };
  const twin = items.find((entry) => entry !== source && pendingKey(entry) === pendingKey(moved));
  if (!twin) return items.map((entry) => (entry === source ? moved : entry));
  return items
    .filter((entry) => entry !== source)
    .map((entry) => (entry === twin ? { ...entry, quantity: entry.quantity + source.quantity } : entry));
};

/** What the server is sent for a list of pending items; it prices the options itself. */
export const pendingOrderItems = (
  items: PendingItem[]
): {
  variantId: string;
  quantity: number;
  hostessId?: string;
  selectedModifiers?: { modifierId: string }[];
  note?: string;
}[] =>
  items.map((item) => {
    const refs = modifierRefs(item.modifiers);
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      ...(item.hostessId ? { hostessId: item.hostessId } : {}),
      ...(refs.length ? { selectedModifiers: refs } : {}),
      ...(item.note ? { note: item.note } : {}),
    };
  });
