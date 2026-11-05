import type { ChosenModifier } from "@/core/domain/entities/Cashier";
import type { TabletChargeItemDTO } from "@/core/application/dtos/RoomTabletDTO";
import { modifierExtra, modifierKey, modifierRefs } from "@/lib/modifiers/choices";

export interface TabletCartEntry {
  variantId: string;
  quantity: number;
  modifiers: ChosenModifier[];
  note?: string;
}

/** A tablet's cart: one row per item, options and note, so different choices never merge. */
export type TabletCart = Record<string, TabletCartEntry>;

export const cartKey = (entry: Omit<TabletCartEntry, "quantity">) =>
  [entry.variantId, modifierKey(entry.modifiers), entry.note?.toLowerCase() ?? ""].join("|");

/** Adds to (or takes from) the row for these choices; a row at 0 goes. */
export function addToCart(
  cart: TabletCart,
  entry: Omit<TabletCartEntry, "quantity">,
  delta: number
): TabletCart {
  const key = cartKey(entry);
  const quantity = Math.max(0, (cart[key]?.quantity ?? 0) + delta);
  const next = { ...cart };
  if (quantity) next[key] = { ...entry, quantity };
  else delete next[key];
  return next;
}

/** Changes a row's note; a row that now matches another joins it. */
export function renote(cart: TabletCart, key: string, note?: string): TabletCart {
  const row = cart[key];
  if (!row) return cart;
  const rest = { ...cart };
  delete rest[key];
  return addToCart(rest, { variantId: row.variantId, modifiers: row.modifiers, note }, row.quantity);
}

/** How many of an item are in the cart, whatever their choices. */
export const countOf = (cart: TabletCart, variantId: string) =>
  Object.values(cart)
    .filter((entry) => entry.variantId === variantId)
    .reduce((sum, entry) => sum + entry.quantity, 0);

/** One of an item with these options, at the menu price. */
export const unitPriceOf = (price: string | number, modifiers: ChosenModifier[]) =>
  Number(price || 0) + modifierExtra(modifiers);

/** What the server is sent: option ids only, and the note when there is one. */
export const chargeItems = (cart: TabletCart): TabletChargeItemDTO[] =>
  Object.values(cart).map((entry) => ({
    variantId: entry.variantId,
    quantity: entry.quantity,
    ...(entry.modifiers.length ? { selectedModifiers: modifierRefs(entry.modifiers) } : {}),
    ...(entry.note ? { note: entry.note } : {}),
  }));
