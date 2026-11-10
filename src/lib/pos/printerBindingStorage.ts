export type PrinterTransport = "NETWORK" | "USB" | "BLUETOOTH";
export type PrinterSector = "KDS" | "CHECKOUT" | "FINANCE";
/** The area of the venue a printer prints for; none means every area. */
export type PrinterArea = "BAR" | "KTV" | "SPA";

export interface PrinterBinding {
  id: string;
  backendPrinterId?: string;
  transport: PrinterTransport;
  displayName: string;
  deviceName?: string;
  host?: string;
  port?: number;
  sectors?: PrinterSector[];
  printsFor?: PrinterArea[];
  categoryIds?: string[];
  lastVerifiedAt: string;
  lastError?: string | null;
}

interface PrinterBindingStore {
  version: 1;
  defaultBindingId?: string;
  bindings: Record<string, PrinterBinding>;
}

export const PRINTER_BINDINGS_CHANGED = "pos:printer-bindings-changed";

const keyFor = (tenantId: string, registerId: string) =>
  `pos:printerBindings:${tenantId || "unknown"}:${registerId || "default"}`;

const emptyStore = (): PrinterBindingStore => ({ version: 1, bindings: {} });

/**
 * localStorage is not always usable: embedded WebViews can deny it, and the
 * denial can surface as a thrown error rather than a missing API. Mirroring
 * writes in memory means a printer configured in this session still prints
 * (Settings -> Checkout/KDS) instead of silently losing the save.
 */
const memoryStorage = new Map<string, string>();

const readValue = (key: string): string | null => {
  try {
    if (typeof localStorage !== "undefined") {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
      if (!memoryStorage.has(key)) return null;
    }
  } catch {
    // Storage is blocked; fall through to the in-memory mirror.
  }
  return memoryStorage.get(key) ?? null;
};

const writeValue = (key: string, value: string): void => {
  try {
    if (typeof localStorage === "undefined") throw new Error("storage unavailable");
    localStorage.setItem(key, value);
    memoryStorage.delete(key);
    return;
  } catch {
    // Blocked storage: the in-memory mirror below keeps this session working.
  }
  memoryStorage.set(key, value);
};

const storageKeys = (): string[] => {
  const keys = new Set<string>(memoryStorage.keys());
  try {
    if (typeof localStorage !== "undefined") {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key) keys.add(key);
      }
    }
  } catch {
    // Blocked storage: the in-memory keys are still returned.
  }
  return Array.from(keys);
};

type LegacyPrinterBinding = PrinterBinding & {
  stationId?: string;
  stationIds?: string[];
};

const normalizeBinding = (
  binding: LegacyPrinterBinding
): PrinterBinding => {
  const normalized = { ...binding };
  delete normalized.stationId;
  delete normalized.stationIds;
  return normalized;
};

const normalizeStore = (store: PrinterBindingStore): PrinterBindingStore => ({
  ...store,
  bindings: Object.fromEntries(
    Object.entries(store.bindings || {}).map(([id, binding]) => [
      id,
      normalizeBinding(binding as LegacyPrinterBinding),
    ])
  ),
});

export function readPrinterBindings(
  tenantId: string,
  registerId: string
): PrinterBindingStore {
  try {
    const raw = readValue(keyFor(tenantId, registerId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as PrinterBindingStore;
    return parsed?.version === 1 && parsed.bindings
      ? normalizeStore(parsed)
      : emptyStore();
  } catch {
    return emptyStore();
  }
}

const bindingsFromStore = (store: PrinterBindingStore) => {
  const bindings = Object.values(store.bindings || {});
  const savedDefault = store.defaultBindingId
    ? store.bindings[store.defaultBindingId] || null
    : null;
  return {
    bindings,
    defaultBinding: savedDefault || bindings[0] || null,
  };
};

export function listStoredPrinterBindings(
  tenantId: string,
  registerId: string
): { bindings: PrinterBinding[]; defaultBinding: PrinterBinding | null } {
  const current = bindingsFromStore(readPrinterBindings(tenantId, registerId));
  if (current.bindings.length) return current;

  for (const key of storageKeys()) {
    if (!key.startsWith("pos:printerBindings:")) continue;
    try {
      const parsed = JSON.parse(readValue(key) || "") as PrinterBindingStore;
      const found = bindingsFromStore(normalizeStore(parsed));
      if (found.bindings.length) return found;
    } catch {
      // Ignore unreadable printer settings from another register.
    }
  }

  return current;
}

const write = (
  tenantId: string,
  registerId: string,
  store: PrinterBindingStore
) => {
  writeValue(keyFor(tenantId, registerId), JSON.stringify(store));
  try {
    window.dispatchEvent(new CustomEvent(PRINTER_BINDINGS_CHANGED));
  } catch {
    // The change event is optional outside a browser window.
  }
};

export function savePrinterBinding(
  tenantId: string,
  registerId: string,
  binding: PrinterBinding,
  makeDefault = false
): void {
  const store = readPrinterBindings(tenantId, registerId);
  write(tenantId, registerId, {
    ...store,
    defaultBindingId:
      makeDefault || !store.defaultBindingId ? binding.id : store.defaultBindingId,
    bindings: { ...store.bindings, [binding.id]: normalizeBinding(binding) },
  });
}

export function removeLocalOnlyPrinterBindings(
  tenantId: string,
  registerId: string
): void {
  const store = readPrinterBindings(tenantId, registerId);
  const bindings = Object.fromEntries(
    Object.entries(store.bindings).filter(([, binding]) => binding.backendPrinterId)
  );
  if (Object.keys(bindings).length === Object.keys(store.bindings).length) return;
  const nextDefault =
    store.defaultBindingId && bindings[store.defaultBindingId]
      ? store.defaultBindingId
      : Object.keys(bindings)[0];
  write(tenantId, registerId, {
    ...store,
    bindings,
    defaultBindingId: nextDefault,
  });
}

export function removePrinterBinding(
  tenantId: string,
  registerId: string,
  bindingId: string
): void {
  const store = readPrinterBindings(tenantId, registerId);
  const bindings = { ...store.bindings };
  delete bindings[bindingId];
  const nextDefault =
    store.defaultBindingId === bindingId
      ? Object.keys(bindings)[0]
      : store.defaultBindingId;
  write(tenantId, registerId, {
    ...store,
    bindings,
    defaultBindingId: nextDefault,
  });
}

export function setDefaultPrinterBinding(
  tenantId: string,
  registerId: string,
  bindingId: string
): void {
  const store = readPrinterBindings(tenantId, registerId);
  if (!store.bindings[bindingId]) return;
  write(tenantId, registerId, { ...store, defaultBindingId: bindingId });
}

export function getDefaultPrinterBinding(
  tenantId: string,
  registerId: string
): PrinterBinding | null {
  const store = readPrinterBindings(tenantId, registerId);
  return store.defaultBindingId
    ? store.bindings[store.defaultBindingId] || null
    : null;
}

export function bindingsForSector(
  bindings: PrinterBinding[],
  sector: PrinterSector
): PrinterBinding[] {
  return bindings.filter((binding) => binding.sectors?.includes(sector));
}

const physicalPrinterKey = (binding: PrinterBinding): string => {
  if (binding.transport === "NETWORK" && binding.host) {
    return `NETWORK:${binding.host.trim().toLowerCase()}:${binding.port || 9100}`;
  }
  if (binding.deviceName?.trim()) {
    return `${binding.transport}:${binding.deviceName.trim().toLowerCase()}`;
  }
  if (binding.backendPrinterId) return `BACKEND:${binding.backendPrinterId}`;
  return `BINDING:${binding.id}`;
};

/** A physical printer may have both an old local and a synced backend binding. */
const uniquePhysicalPrinters = (bindings: PrinterBinding[]): PrinterBinding[] => {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = physicalPrinterKey(binding);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * A guest slip and the office copy belong to an area of the venue; a kitchen
 * ticket does not. A KDS printer takes the tickets of the stations it serves,
 * whatever areas it prints slips for, so areas never narrow kitchen routing.
 */
export function takesArea(place: PrinterSector): boolean {
  return place === "CHECKOUT" || place === "FINANCE";
}

/**
 * Printers a receipt/kitchen job should go to for one section of one area.
 *
 * A printer's own print sectors are the last word on what it prints: a KDS
 * printer must never take the guest's bill. The areas it prints for come next, and
 * only for the slips that have an area: a KTV guest slip belongs on the KTV
 * printers, not on the bar counter's, even though both are checkout printers of
 * the same outlet. Kitchen tickets ignore areas entirely.
 *
 * A printer set up for the area beats one that names no area at all, the same way
 * a printer that names its sections beats the register's catch-all: a bar counter
 * that was never given its places used to take the KTV's slip as well, and the
 * guest's bill came out twice, on two counters. A printer that names no areas is
 * still the printer of every area when the outlet has no printer for that area.
 * The two rules stack in that order: naming the section comes first — so a
 * catch-all printer never takes the counter's slip — and the area decides within
 * the printers that name it.
 */
export function resolveBindingsForPlace(
  bindings: PrinterBinding[],
  defaultBinding: PrinterBinding | null,
  place: PrinterSector,
  area?: PrinterArea
): PrinterBinding[] {
  const wanted = takesArea(place) ? area : undefined;
  const declaresArea = (binding: PrinterBinding): boolean =>
    Boolean(binding.printsFor?.length);
  const servesArea = (binding: PrinterBinding): boolean =>
    !wanted || !declaresArea(binding) || Boolean(binding.printsFor?.includes(wanted));
  /** The printers set up for this area, or every candidate when none is. */
  const preferringArea = (candidates: PrinterBinding[]): PrinterBinding[] => {
    if (!wanted) return candidates;
    const declared = candidates.filter(declaresArea);
    return declared.length ? declared : candidates;
  };

  const bySector = bindingsForSector(bindings, place);
  const serving = preferringArea(bySector.filter(servesArea));
  if (serving.length) return uniquePhysicalPrinters(serving);
  // This section has printers, but none of them serves the area: a slip on one
  // of them is better than no slip at all.
  if (bySector.length) return uniquePhysicalPrinters(bySector);

  const catchAll = bindings.filter((binding) => !binding.sectors?.length);
  const catching = catchAll.filter(servesArea);
  const pool = preferringArea(catching.length ? catching : catchAll);
  if (!pool.length) return [];
  const preferred = pool.filter(
    (binding) => binding.id === defaultBinding?.id
  );
  return uniquePhysicalPrinters(preferred.length ? preferred : pool);
}
