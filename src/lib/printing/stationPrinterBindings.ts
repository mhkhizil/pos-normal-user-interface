import type { KitchenPrinter } from "@/core/domain/entities/KitchenPrinter";
import type { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import type { StationRoute } from "./routeKitchenPrint";

const addressOf = (host?: string, port?: number | string) =>
  host ? `${host.trim()}:${Number(port) || 9100}` : null;

/** The station printers this device has no saved printer for. */
export function unboundStationPrinterIds(
  stations: StationRoute[],
  bindings: PrinterBinding[]
): string[] {
  const bound = new Set(
    bindings.map((binding) => binding.backendPrinterId).filter(Boolean)
  );
  const ids = stations.flatMap((station) => station.printerIds);
  return Array.from(new Set(ids.filter((id) => !bound.has(id))));
}

/**
 * Lets a station reach a printer this device did not save under the station's
 * own printer record. Each location keeps its own record of the same paper (a
 * KTV room's Kitchen station names the VIP Lounge's "Kitchen", the waiter
 * tablet saved the Waiter Tablet's), so the record is matched to a saved
 * printer at the same address, or - when none is saved - printed to at the
 * address the back office holds for it. A copy keeps the saved printer's id,
 * so a printer named twice by a station still prints the ticket once.
 */
export function withStationPrinters(
  bindings: PrinterBinding[],
  printers: KitchenPrinter[],
  missingIds: string[]
): PrinterBinding[] {
  if (!missingIds.length) return bindings;
  const byId = new Map(printers.map((printer) => [printer.id, printer]));
  const atAddress = new Map<string, PrinterBinding>();
  for (const binding of bindings) {
    const address =
      binding.transport === "NETWORK" ? addressOf(binding.host, binding.port) : null;
    if (address && !atAddress.has(address)) atAddress.set(address, binding);
  }

  const added: PrinterBinding[] = [];
  for (const id of missingIds) {
    const printer = byId.get(id);
    const address = addressOf(printer?.ipAddress, printer?.port);
    if (!printer || !address) continue;
    const saved = atAddress.get(address);
    if (saved) {
      added.push({ ...saved, backendPrinterId: id });
      continue;
    }
    if (!printer.isActive) continue;
    const binding: PrinterBinding = {
      id: `backend:${printer.id}`,
      backendPrinterId: printer.id,
      transport: "NETWORK",
      displayName: printer.name,
      host: printer.ipAddress,
      port: printer.port,
      sectors: printer.sectors,
      printsFor: printer.printsFor,
      lastVerifiedAt: "",
      lastError: null,
    };
    atAddress.set(address, binding);
    added.push(binding);
  }
  return added.length ? [...bindings, ...added] : bindings;
}
