import { useCallback, useEffect, useState } from "react";
import { KdsTicket } from "../../domain/entities/Cashier";
import { IKitchenPrinterService } from "../../domain/services/IKitchenPrinterService";
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
import { hasNativePrinterBridge } from "@/lib/printing/webPrinterTransports";
import {
  groupKitchenJobs,
  KitchenPrintPlan,
  KitchenRoutingOptions,
  PrinterJob,
  StationRoute,
} from "@/lib/printing/routeKitchenPrint";
import { printLogoFor } from "@/lib/printing/printLogo";
import { previewBeforePrint } from "@/lib/printing/printPreview";
import { checkoutCopies, copySlip } from "@/lib/printing/receiptCopies";
import { printPlaceToTemplateType } from "@/lib/printing/selectPrintTemplate";
import {
  PRINTER_BINDINGS_CHANGED,
  PrinterBinding,
  PrinterTransport,
  listStoredPrinterBindings,
  readPrinterBindings,
  removePrinterBinding,
  resolveBindingsForPlace,
  savePrinterBinding,
  setDefaultPrinterBinding,
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
    async (place: PrintPlace): Promise<PrinterBinding[]> => {
      if (!isBrowserPrinting()) return [];
      try {
        const result = await printerService.list({
          page: 1,
          limit: 100,
          locationId: locationId || undefined,
        });
        return result.printers
          .filter((printer) => Boolean(printer.ipAddress))
          .filter(
            (printer) =>
              !printer.sectors?.length || printer.sectors.includes(place)
          )
          .map((printer) => ({
            id: `backend:${printer.id}`,
            backendPrinterId: printer.id,
            transport: "NETWORK" as const,
            displayName: printer.name,
            host: printer.ipAddress,
            port: printer.port,
            sectors: printer.sectors,
            lastVerifiedAt: "",
            lastError: null,
          }));
      } catch {
        return [];
      }
    },
    [locationId, printerService]
  );

  const templateFor = useCallback(
    async (place: PrintPlace, type: PrintTemplateType = printPlaceToTemplateType(place)) => {
      try {
        const service = container.resolve<IPrintTemplateService>("printTemplateService");
        const resolved = await service.resolve({
          type,
          ...(locationId ? { locationId } : {}),
        });
        return { settings: resolved.settings, paperWidth: resolved.paperWidth };
      } catch {
        return undefined;
      }
    },
    [locationId]
  );

  const printKitchen = useCallback(
    async (
      slip: KitchenSlip,
      stations: StationRoute[] = [],
      options: KitchenRoutingOptions = {}
    ): Promise<KitchenPrintPlan> => {
      const client = await configureClient(tenantId, registerId);
      const current = currentBindings();
      const resolved = slip.template ? undefined : await templateFor("KDS");
      const template = slip.template || resolved?.settings;
      const paperWidth = slip.paperWidth || resolved?.paperWidth;
      const plan = groupKitchenJobs(
        slip.lines || [],
        current.bindings,
        current.defaultBinding,
        slip.stationId,
        stations,
        options
      );
      const lines = slip.lines || [];
      // Station routing can leave every line unrouted (for example a category
      // with no station, or a station whose printer is not bound on this
      // device). Rather than silently printing nothing, fall back to the
      // KDS/default printer so the kitchen ticket still reaches the paper.
      //
      // This fallback must NOT run when the caller requires strict station
      // routing (`requireStationRouting`). Otherwise a category that is not
      // assigned to the matching station would be sprayed onto the default KDS
      // printer (for example "only salad" routed to the drink-station printer
      // would still receive every other category). In strict mode the plan is
      // returned untouched so the caller can surface the unrouted lines.
      let jobs: PrinterJob[] = plan.jobs;
      if (!options.requireStationRouting && !jobs.length && lines.length) {
        const localTargets = resolveBindingsForPlace(
          current.bindings,
          current.defaultBinding,
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
    [backendTargets, currentBindings, registerId, templateFor, tenantId]
  );

  const printReceipt = useCallback(
    async (receipt: SaleReceipt) => {
      const client = await configureClient(tenantId, registerId);
      const targetsFor = async (place: PrintPlace) => {
        const current = currentBindings();
        const local = resolveBindingsForPlace(current.bindings, current.defaultBinding, place);
        return local.length ? local : backendTargets(place);
      };

      let previewed = false;
      const printOne = async (slip: SaleReceipt) => {
        const place = slip.place || "CHECKOUT";
        let targets = await targetsFor(place);
        // The office copy goes to the till's own printer when there is no finance one.
        if (!targets.length && slip.copy === "FINANCE") targets = await targetsFor("CHECKOUT");
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
        // The guest's copy is the one shown; the copies after it follow the answer.
        if (!previewed) {
          previewed = true;
          if (!(await previewBeforePrint(ready))) return null;
        }
        if (!targets.length) {
          throw new Error(
            place === "FINANCE"
              ? "No finance printer is connected"
              : place === "KDS"
                ? "No KDS printer is connected"
                : "No checkout printer is connected"
          );
        }
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
        if (!(await printOne(copySlip(sale, copy)))) return;
      }
    },
    [backendTargets, currentBindings, registerId, templateFor, tenantId]
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
