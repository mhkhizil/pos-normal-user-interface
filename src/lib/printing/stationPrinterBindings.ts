import type { KitchenPrinter } from "@/core/domain/entities/KitchenPrinter";
import type { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import type { StationRoute } from "./routeKitchenPrint";

const addressOf = (host: string | undefined, port: number | undefined) =>
  host ? `${host.trim().toLowerCase()}:${port || 9100}` : "";

/**
 * The till's printers plus the stations' network printers it has not saved.
 *
 * A station's ticket only printed on a printer saved on this till, so a station
 * set up in the back office but never saved here got nothing. Its printer record
 * has an address the till can reach, so it joins the list; a saved printer at the
 * same address is that printer, not a second one.
 */
export function withStationPrinters(
  bindings: PrinterBinding[],
  printers: KitchenPrinter[],
  stations: StationRoute[],
): PrinterBinding[] {
  const wanted = new Set(stations.flatMap((station) => station.printerIds));
  const bound = new Set(
    bindings.map((binding) => binding.backendPrinterId).filter(Boolean),
  );
  const result = [...bindings];
  for (const printer of printers) {
    if (!wanted.has(printer.id) || bound.has(printer.id) || !printer.ipAddress)
      continue;
    if (printer.isActive === false) continue;
    const address = addressOf(printer.ipAddress, printer.port);
    const local = result.findIndex(
      (binding) =>
        !binding.backendPrinterId &&
        binding.transport === "NETWORK" &&
        addressOf(binding.host, binding.port) === address,
    );
    if (local >= 0) {
      result[local] = { ...result[local], backendPrinterId: printer.id };
      continue;
    }
    result.push({
      id: `backend:${printer.id}`,
      backendPrinterId: printer.id,
      transport: "NETWORK",
      displayName: printer.name,
      host: printer.ipAddress,
      port: printer.port || 9100,
      sectors: printer.sectors,
      lastVerifiedAt: "",
      lastError: null,
    });
  }
  return result;
}
