export interface PendingItem {
  variantId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  foc?: boolean;
}

export const pendingKey = (item: Pick<PendingItem, "variantId" | "foc">): string =>
  item.foc ? `${item.variantId}:foc` : item.variantId;

export const addPending = (
  items: PendingItem[],
  item: Omit<PendingItem, "quantity" | "foc">,
  quantity = 1
): PendingItem[] => {
  const existing = items.find((entry) => entry.variantId === item.variantId && !entry.foc);
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
