const STORAGE_KEY = "pos-multi-order-ids";

type TableOrderMap = Record<string, string[]>;

const readMap = (): TableOrderMap => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TableOrderMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeMap = (map: TableOrderMap) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
};

export const readTableOrderIds = (tableId: string): string[] => {
  const ids = readMap()[tableId];
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
};

export const writeTableOrderIds = (tableId: string, orderIds: string[]) => {
  const map = readMap();
  map[tableId] = Array.from(new Set(orderIds.filter(Boolean)));
  writeMap(map);
};

export const mergeTableOrderIds = (
  tableId: string,
  primaryOrderId: string,
  extraIds: string[] = [],
  closedOrderIds: ReadonlySet<string> = new Set()
): string[] => {
  // A list that starts with another order is from guests who have since paid,
  // perhaps on another till; the table's orders start again from this one.
  const stored = readTableOrderIds(tableId);
  const kept = (stored[0] === primaryOrderId ? stored : []).filter(
    (id) => !closedOrderIds.has(id)
  );
  const merged = Array.from(
    new Set([primaryOrderId, ...kept, ...extraIds].filter(Boolean))
  );
  writeTableOrderIds(tableId, merged);
  return merged;
};

/**
 * How many orders a table has, going by the server's open session for it: none
 * when the server has the table free, and only the till's own list when that
 * list is for the guests sitting there now, less orders whose session closed.
 */
export const countTableOrders = (
  orderIds: string[],
  openOrderId?: string | null,
  closedOrderIds: ReadonlySet<string> = new Set()
): number => {
  if (!openOrderId) return 0;
  if (orderIds[0] !== openOrderId) return 1;
  return orderIds.filter((id) => !closedOrderIds.has(id)).length;
};

export const clearTableOrderIds = (tableId: string) => {
  const map = readMap();
  delete map[tableId];
  writeMap(map);
};
