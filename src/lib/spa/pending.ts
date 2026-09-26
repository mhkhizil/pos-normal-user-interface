export interface PendingItem {
  variantId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export const addPending = (
  items: PendingItem[],
  item: Omit<PendingItem, "quantity">,
  quantity = 1
): PendingItem[] => {
  const existing = items.find((entry) => entry.variantId === item.variantId);
  if (existing) {
    return items.map((entry) =>
      entry.variantId === item.variantId
        ? { ...entry, quantity: entry.quantity + quantity }
        : entry
    );
  }
  return [...items, { ...item, quantity }];
};

export const changePending = (
  items: PendingItem[],
  variantId: string,
  delta: number
): PendingItem[] =>
  items
    .map((entry) =>
      entry.variantId === variantId ? { ...entry, quantity: entry.quantity + delta } : entry
    )
    .filter((entry) => entry.quantity > 0);

export const pendingTotal = (items: PendingItem[]): number =>
  items.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
