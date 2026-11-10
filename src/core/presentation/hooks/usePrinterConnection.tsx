import { useCallback, useEffect, useState } from "react";
import { KdsTicket } from "../../domain/entities/Cashier";
import { KitchenPrinter } from "../../domain/entities/KitchenPrinter";
import { IKitchenPrinterService } from "../../domain/services/IKitchenPrinterService";
import { IKdsStationService } from "../../domain/services/IKdsStationService";
import { IPrintTemplateService } from "../../domain/services/IPrintTemplateService";
import type { ISalesOrderService } from "../../domain/services/ISalesOrderService";
import {
  PriceCurrency,
  PrintCompany,
  PrintTemplateType,
} from "../../domain/entities/PrintTemplate";
import type { ApiVenueSettingRepository } from "../../infrastructure/repositories/ApiVenueSettingRepository";
import container from "../../infrastructure/di/container";
import { browserPrinterClient } from "../../infrastructure/printing/BrowserPrinterClient";
import { getPrinterClient } from "../../infrastructure/printing/getPrinterClient";
import type { IPrinterClient } from "../../infrastructure/printing/IPrinterClient";
import { isBrowserPrinting } from "../../infrastructure/printing/PrinterClient";
import {
  kdsTicketSlip,
  KitchenSlip,
  PrintPlace,
  SaleReceipt,
} from "@/lib/printing/formatKdsTicket";
import { applyKdsTicketModifiers } from "@/lib/printing/kdsTicketModifiers";
import { withStationPrinters } from "@/lib/printing/stationPrinterBindings";
import { hasNativePrinterBridge } from "@/lib/printing/webPrinterTransports";
import {
  groupKitchenJobs,
  KitchenPrintPlan,
  KitchenRoutingOptions,
  PrinterJob,
  StationRoute,
} from "@/lib/printing/routeKitchenPrint";
import { printLogoFor } from "@/lib/printing/printLogo";
import { checkoutCopies, copySlip } from "@/lib/printing/receiptCopies";
import { printPlaceToTemplateType, pickSavedPrintTemplate } from "@/lib/printing/selectPrintTemplate";
import {
  PRINTER_BINDINGS_CHANGED,
  PrinterArea,
  PrinterBinding,
  PrinterSector,
  PrinterTransport,
  listStoredPrinterBindings,
  readPrinterBindings,
  removePrinterBinding,
  resolveBindingsForPlace,
  savePrinterBinding,
  setDefaultPrinterBinding,
  takesArea,
} from "@/lib/pos/printerBindingStorage";

/** The company prints are headed with, loaded once per signed-in company. */
const companies = new Map<string, Promise<PrintCompany | null>>();

export const printCompanyFor = (tenantId: string) => {
  let company = companies.get(tenantId);
  if (!company) {
    company = container
      .resolve<IPrintTemplateService>("printTemplateService")
      .company()
      .then((found) => (found.name ? found : null))
      .catch(() => {
        companies.delete(tenantId);
        return null;
      });
    companies.set(tenantId, company);
  }
  return company;
};

/** The money receipts print amounts in, loaded once per signed-in company. */
const currencies = new Map<string, Promise<PriceCurrency | undefined>>();

export const printCurrencyFor = (tenantId: string) => {
  let currency = currencies.get(tenantId);
  if (!currency) {
    currency = container
      .resolve<ApiVenueSettingRepository>("venueSettingRepository")
      .get()
      .then((setting): PriceCurrency | undefined => setting.currency)
      .catch(() => {
        currencies.delete(tenantId);
        return undefined;
      });
    currencies.set(tenantId, currency);
  }
  return currency;
};

const configureClient = async (
  tenantId: string,
  registerId: string
): Promise<IPrinterClient> => {
  const client = await getPrinterClient();
  if (client === browserPrinterClient) {
    browserPrinterClient.configureScope(tenantId, registerId);
  }
  return client;
};

export function usePrinterConnection(
  tenantId: string,
  registerId: string,
  locationId?: string
) {
  const [, setRevision] = useState(0);
  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(isBrowserPrinting());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(PRINTER_BINDINGS_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PRINTER_BINDINGS_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const store = readPrinterBindings(tenantId, registerId);
  const bindings = Object.values(store.bindings);
  const defaultBinding = store.defaultBindingId
    ? store.bindings[store.defaultBindingId] || null
    : null;

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const client = await configureClient(tenantId, registerId);
      await client.connect();
      setIsConnected(client.isConnected());
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : isBrowserPrinting()
            ? "Unable to start mobile printing"
            : "Unable to connect to QZ Tray";
      setError(message);
      setIsConnected(false);
      throw caught;
    } finally {
      setIsConnecting(false);
    }
  }, [registerId, tenantId]);

  useEffect(() => {
    void connect().catch(() => undefined);
  }, [connect]);

  const discover = useCallback(
    async (transport?: PrinterTransport) => {
      setIsConnecting(true);
      setError(null);
      try {
        const client = await configureClient(tenantId, registerId);
        const names = await client.findPrinters(transport);
        setDeviceNames(names);
        setIsConnected(client.isConnected());
        return names;
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Unable to discover printers";
        setError(message);
        throw caught;
      } finally {
        setIsConnecting(false);
      }
    },
    [registerId, tenantId]
  );

  const verify = useCallback(
    async (binding: PrinterBinding) => {
      setIsConnecting(true);
      setError(null);
      try {
        const client = await configureClient(tenantId, registerId);
        await client.testPrint(binding);
        setIsConnected(client.isConnected());
        return { ...binding, lastVerifiedAt: new Date().toISOString(), lastError: null };
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Printer test failed";
        setError(message);
        throw caught;
      } finally {
        setIsConnecting(false);
      }
    },
    [registerId, tenantId]
  );

  const saveBinding = useCallback(
    (binding: PrinterBinding, makeDefault = false) =>
      savePrinterBinding(tenantId, registerId, binding, makeDefault),
    [registerId, tenantId]
  );

  const removeBinding = useCallback(
    (id: string) => removePrinterBinding(tenantId, registerId, id),
    [registerId, tenantId]
  );

  const makeDefault = useCallback(
    (id: string) => setDefaultPrinterBinding(tenantId, registerId, id),
    [registerId, tenantId]
  );

  const currentBindings = useCallback(
    () => listStoredPrinterBindings(tenantId, registerId),
    [registerId, tenantId]
  );

  const printerService =
    container.resolve<IKitchenPrinterService>("kitchenPrinterService");

  /**
   * Last-resort print targets taken from the back-office printer list.
   *
   * A phone can end up with no local binding at all (fresh tablet, or a WebView
   * that drops localStorage). A network printer configured in the back office is
   * still reachable from the tablet, so derive a binding from the printer record
   * instead of failing with "No checkout printer is connected".
   *
   * Desktop always has its local binding, so this never runs there.
   */
  const backendTargets = useCallback(
    async (place: PrintPlace, area?: PrinterArea): Promise<PrinterBinding[]> => {
      if (!isBrowserPrinting()) return [];
      // A kitchen ticket is not printed for an area, only a slip is.
      const wanted = takesArea(place) ? area : undefined;
      try {
        const result = await printerService.list({
          page: 1,
          limit: 100,
          locationId: locationId || undefined,
          sector: place,
          ...(wanted ? { area: wanted } : {}),
        });
        const reachable = result.printers
          .filter((printer) => Boolean(printer.ipAddress))
          .filter(
            (printer) =>
              !printer.sectors?.length || printer.sectors.includes(place)
          )
          // A printer set up for other areas of the venue never prints this one.
          .filter(
            (printer) =>
              !wanted || !printer.printsFor?.length || printer.printsFor.includes(wanted)
          );
        // A printer set up for the area beats one that names no area at all, the
        // same way the local bindings rank them: an unticked bar counter must not
        // take the KTV's slip alongside the KTV's own.
        const declared = wanted
          ? reachable.filter((printer) => Boolean(printer.printsFor?.length))
          : [];
        return (declared.length ? declared : reachable).map((printer) => ({
          id: `backend:${printer.id}`,
          backendPrinterId: printer.id,
          transport: "NETWORK" as const,
          displayName: printer.name,
          host: printer.ipAddress,
          port: printer.port,
          sectors: printer.sectors,
          printsFor: printer.printsFor,
          lastVerifiedAt: "",
          lastError: null,
        }));
      } catch {
        return [];
      }
    },
    [locationId, printerService]
  );

  /**
   * The register's bindings, with the print sectors the back office now gives
   * their printers.
   *
   * A binding only stores the sectors its printer had the last time that printer
   * was saved on this device, and only when the save's test print succeeded. So a
   * binding can name no sectors at all (saved before sectors existed) or ones the
   * back office has since changed — and then a KDS printer prints the guest's
   * bill. The printer record is the source of truth, so it decides here.
   */
  const bindingsWithSectors = useCallback(async () => {
    const current = currentBindings();
    if (!current.bindings.length) return current;
    let printers: KitchenPrinter[];
    try {
      const result = await printerService.list({
        page: 1,
        limit: 100,
        locationId: locationId || undefined,
      });
      printers = result.printers;
    } catch {
      return current;
    }
    if (!printers.length) return current;

    const byAddress = new Map<string, string>();
    const sectorsOf = new Map<string, PrinterSector[]>();
    const areasOf = new Map<string, PrinterArea[]>();
    for (const printer of printers) {
      sectorsOf.set(printer.id, printer.sectors || []);
      areasOf.set(printer.id, printer.printsFor || []);
      if (printer.ipAddress) {
        byAddress.set(
          `${printer.ipAddress.trim().toLowerCase()}:${printer.port || 9100}`,
          printer.id
        );
      }
    }
    const recordFor = (binding: PrinterBinding): string | undefined =>
      (binding.backendPrinterId && sectorsOf.has(binding.backendPrinterId)
        ? binding.backendPrinterId
        : undefined) ||
      (binding.transport === "NETWORK" && binding.host
        ? byAddress.get(
            `${binding.host.trim().toLowerCase()}:${binding.port || 9100}`
          )
        : undefined);
    const sectorsFor = (binding: PrinterBinding): PrinterSector[] | undefined => {
      const id = recordFor(binding);
      const declared = id ? sectorsOf.get(id) : undefined;
      return declared?.length ? declared : undefined;
    };
    const areasFor = (binding: PrinterBinding): PrinterArea[] | undefined => {
      // The record is the authority even when the back office cleared its places:
      // an empty answer is a printer that names no area, not an answer to ignore.
      const id = recordFor(binding);
      return id ? areasOf.get(id) : undefined;
    };

    let changed = false;
    const bindings = current.bindings.map((binding) => {
      const sectors = sectorsFor(binding);
      const printsFor = areasFor(binding);
      const sectorsSame =
        !sectors ||
        (binding.sectors?.length === sectors.length &&
          sectors.every((sector) => binding.sectors?.includes(sector)));
      const areasSame =
        !printsFor ||
        (binding.printsFor?.length === printsFor.length &&
          printsFor.every((area) => binding.printsFor?.includes(area)));
      if (sectorsSame && areasSame) return binding;
      changed = true;
      return {
        ...binding,
        ...(sectors ? { sectors } : {}),
        ...(printsFor ? { printsFor } : {}),
      };
    });
    if (!changed) return current;
    return {
      bindings,
      defaultBinding:
        bindings.find((binding) => binding.id === current.defaultBinding?.id) ||
        current.defaultBinding,
    };
  }, [currentBindings, locationId, printerService]);

  /**
   * The template a slip prints with: what the server resolves, and when it
   * answers with its built-in layout — or does not answer at all — the template
   * this outlet saved on the Print Template screen. The built-in layout knows
   * nothing of the sizes the shop set (its kitchen items print at double
   * height), so a saved template has to win even when it is not the flagged
   * default, otherwise the text size on that screen never reaches the paper.
   */
  const templateFor = useCallback(
    async (place: PrintPlace, type: PrintTemplateType = printPlaceToTemplateType(place)) => {
      const service = container.resolve<IPrintTemplateService>("printTemplateService");
      const savedFor = async () => {
        try {
          const listed = await service.list({
            page: 1,
            limit: 100,
            ...(locationId ? { locationId } : {}),
          });
          const picked = pickSavedPrintTemplate(place, listed?.templates || [], locationId);
          return picked
            ? { settings: picked.settings, paperWidth: picked.paperWidth }
            : undefined;
        } catch {
          return undefined;
        }
      };
      try {
        const resolved = await service.resolve({
          type,
          ...(locationId ? { locationId } : {}),
        });
        const own = { settings: resolved.settings, paperWidth: resolved.paperWidth };
        return resolved.source === "BUILTIN" ? (await savedFor()) || own : own;
      } catch {
        return savedFor();
      }
    },
    [locationId]
  );

  /**
   * The outlet's KDS stations, for a kitchen print from a caller that has none to
   * hand - a room tablet's order, say. Without them a ticket can only go to the
   * till's default printer, which is how a room's drink came out at the kitchen.
   */
  const stationsFor = useCallback(async (): Promise<StationRoute[]> => {
    if (!locationId) return [];
    try {
      const service = container.resolve<IKdsStationService>("kdsStationService");
      const listed = await service.list({ page: 1, limit: 100, locationId });
      return (listed?.stations || []).map((station) => ({
        id: station.id,
        name: station.name,
        printerIds: station.printerIds || [],
        categoryIds: station.routingRules?.categoryIds || [],
      }));
    } catch {
      return [];
    }
  }, [locationId]);

  /** The back-office records of station printers this till has not saved. */
  const stationPrinters = useCallback(
    async (stations: StationRoute[], bindings: PrinterBinding[]): Promise<KitchenPrinter[]> => {
      const bound = new Set(bindings.map((binding) => binding.backendPrinterId));
      if (stations.every((station) => station.printerIds.every((id) => bound.has(id)))) return [];
      try {
        const result = await printerService.list({
          page: 1,
          limit: 100,
          locationId: locationId || undefined,
        });
        return result.printers;
      } catch {
        return [];
      }
    },
    [locationId, printerService]
  );

  const printKitchen = useCallback(
    async (
      slip: KitchenSlip,
      stations: StationRoute[] = [],
      options: KitchenRoutingOptions = {}
    ): Promise<KitchenPrintPlan> => {
      const client = await configureClient(tenantId, registerId);
      const current = currentBindings();
      // A caller with no station list (a room tablet's order) still has to reach
      // the station of each item's category, so the outlet's stations are read here.
      const routes = stations.length ? stations : await stationsFor();
      const bindings = routes.length
        ? withStationPrinters(
            current.bindings,
            await stationPrinters(routes, current.bindings),
            routes
          )
        : current.bindings;
      const resolved = slip.template ? undefined : await templateFor("KDS");
      const template = slip.template || resolved?.settings;
      const paperWidth = slip.paperWidth || resolved?.paperWidth;
      const plan = groupKitchenJobs(
        slip.lines || [],
        bindings,
        current.defaultBinding,
        slip.stationId,
        routes,
        options
      );
      const lines = slip.lines || [];
      // Without stations the ticket goes to the till's own KDS printer: a
      // one-printer venue prints everything there. With stations set up, an item
      // whose station printer is not saved on this till must NOT fall back to it -
      // that printed a waiter tablet's rice and beer at every counter. The plan
      // comes back unrouted so the caller can say which station is missing.
      let jobs: PrinterJob[] = plan.jobs;
      const stationRouting = options.requireStationRouting || routes.length > 0;
      if (!stationRouting && !jobs.length && lines.length) {
        const kds = await bindingsWithSectors();
        const localTargets = resolveBindingsForPlace(
          kds.bindings,
          kds.defaultBinding,
          "KDS"
        );
        const targets = localTargets.length
          ? localTargets
          : await backendTargets("KDS");
        jobs = targets.map((binding) => ({ binding, lines }));
      }

      const failures: string[] = [];
      for (const job of jobs) {
        try {
          await client.printKitchen(job.binding, {
            ...slip,
            template,
            paperWidth,
            lines: job.lines,
            stationId: job.station?.id || slip.stationId,
            stationName: job.station?.name || slip.stationName,
          });
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Printer communication failed";
          failures.push(`${job.binding.displayName}: ${message}`);
        }
      }
      if (failures.length) {
        throw new Error(failures.join(" "));
      }
      return plan;
    },
    [backendTargets, bindingsWithSectors, currentBindings, registerId, stationPrinters, stationsFor, templateFor, tenantId]
  );

  const printReceipt = useCallback(
    async (receipt: SaleReceipt) => {
      const client = await configureClient(tenantId, registerId);
      const current = await bindingsWithSectors();
      const area = receipt.area;
      const targetsFor = async (place: PrintPlace) => {
        const local = resolveBindingsForPlace(
          current.bindings,
          current.defaultBinding,
          place,
          area
        );
        return local.length ? local : backendTargets(place, area);
      };

      const printOne = async (slip: SaleReceipt) => {
        const place = slip.place || "CHECKOUT";
        let targets = await targetsFor(place);
        // The office copy goes to the till's own printer when there is no finance one.
        if (!targets.length && slip.copy === "FINANCE") targets = await targetsFor("CHECKOUT");
        if (!targets.length) {
          throw new Error(
            place === "FINANCE"
              ? "No finance printer is connected"
              : place === "KDS"
                ? "No KDS printer is connected"
                : "No checkout printer is connected"
          );
        }
        const resolved = slip.template ? undefined : await templateFor(place, slip.templateType);
        const template = slip.template || resolved?.settings;
        const paperWidth = slip.paperWidth || resolved?.paperWidth;
        const company =
          slip.company === undefined && place !== "FINANCE"
            ? await printCompanyFor(tenantId)
            : slip.company;
        const currency = slip.currency || (await printCurrencyFor(tenantId));
        const logoOn = template ? template.header.logo : place === "CHECKOUT";
        const logo =
          slip.logo !== undefined
            ? slip.logo
            : company?.logoUrl && logoOn && slip.showLogo !== false
              ? await printLogoFor(company.logoUrl, paperWidth)
              : null;
        const ready = { ...slip, place, template, paperWidth, company, currency, logo };
        const failures: string[] = [];
        for (const target of targets) {
          try {
            await client.printReceipt(target, ready);
          } catch (caught) {
            const message =
              caught instanceof Error ? caught.message : "Printer communication failed";
            failures.push(`${target.displayName}: ${message}`);
          }
        }
        if (failures.length) throw new Error(failures.join(" "));
        return ready;
      };

      if (!receipt.sale || (receipt.place || "CHECKOUT") !== "CHECKOUT") {
        await printOne(receipt);
        return;
      }
      // A paid bill: the guest's copy settles which template applies, then the rest follow it.
      const resolved = receipt.template ? undefined : await templateFor("CHECKOUT");
      const template = receipt.template || resolved?.settings;
      const sale = { ...receipt, template, paperWidth: receipt.paperWidth || resolved?.paperWidth };
      for (const copy of checkoutCopies(template)) {
        await printOne(copySlip(sale, copy));
      }
    },
    [backendTargets, bindingsWithSectors, registerId, templateFor, tenantId]
  );

  const ticketWithModifiers = useCallback(async (ticket: KdsTicket) => {
    const missing = ticket.kdsTicketLines?.some(
      (line) => !line.kitchenModifiers?.trim()
    );
    if (!missing || !ticket.salesOrderId) return ticket;
    try {
      const service = container.resolve<ISalesOrderService>("salesOrderService");
      const result = await service.getSalesOrderLines(ticket.salesOrderId, {
        page: 1,
        limit: 100,
      });
      return applyKdsTicketModifiers(ticket, result.lines);
    } catch {
      // A ticket still prints if its order lines cannot be reloaded.
      return ticket;
    }
  }, []);

  const printTicket = useCallback(
    async (ticket: KdsTicket, stations: StationRoute[] = []) => {
      const enriched = await ticketWithModifiers(ticket);
      const stationId = enriched.stationId || enriched.station?.id;
      const listed = stationId
        ? stations.find((station) => station.id === stationId)
        : undefined;
      const station: StationRoute | undefined = listed
        ? {
            ...listed,
            printerIds: listed.printerIds.length
              ? listed.printerIds
              : enriched.station?.printerIds || [],
            name: enriched.station?.name || listed.name,
          }
        : enriched.station
          ? {
              id: enriched.station.id,
              name: enriched.station.name,
              printerIds: enriched.station.printerIds,
              categoryIds: [],
            }
          : undefined;
      // A KTV room is printed under the tenant's own name, loaded once per company.
      const company = await printCompanyFor(tenantId);
      return printKitchen(
        {
          ...kdsTicketSlip(enriched, company?.name),
          stationId,
          stationName: station?.name,
        },
        station ? [station] : []
      );
    },
    [printKitchen, tenantId, ticketWithModifiers]
  );

  return {
    bindings,
    defaultBinding,
    deviceNames,
    isConnected,
    isConnecting,
    error,
    nativeBridge: hasNativePrinterBridge(),
    connect,
    discover,
    verify,
    saveBinding,
    removeBinding,
    makeDefault,
    printKitchen,
    printReceipt,
    printTicket,
    clearError: () => setError(null),
  };
}
