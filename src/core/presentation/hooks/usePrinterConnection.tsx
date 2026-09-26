import { useCallback, useEffect, useState } from "react";
import { KdsTicket } from "../../domain/entities/Cashier";
import { qzTrayClient } from "../../infrastructure/printing/QzTrayClient";
import { KitchenSlip, SaleReceipt } from "@/lib/printing/formatKdsTicket";
import {
  groupKitchenJobs,
  StationRoute,
} from "@/lib/printing/routeKitchenPrint";
import {
  PRINTER_BINDINGS_CHANGED,
  PrinterBinding,
  listStoredPrinterBindings,
  readPrinterBindings,
  removePrinterBinding,
  savePrinterBinding,
  setDefaultPrinterBinding,
} from "@/lib/pos/printerBindingStorage";

export function usePrinterConnection(tenantId: string, registerId: string) {
  const [, setRevision] = useState(0);
  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(qzTrayClient.isConnected());
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
      await qzTrayClient.connect();
      setIsConnected(true);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to connect to QZ Tray";
      setError(message);
      setIsConnected(false);
      throw caught;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    void connect().catch(() => undefined);
  }, [connect]);

  const discover = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const names = await qzTrayClient.findPrinters();
      setDeviceNames(names);
      setIsConnected(true);
      return names;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to discover printers";
      setError(message);
      throw caught;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const verify = useCallback(async (binding: PrinterBinding) => {
    setIsConnecting(true);
    setError(null);
    try {
      await qzTrayClient.testPrint(binding);
      setIsConnected(true);
      return { ...binding, lastVerifiedAt: new Date().toISOString(), lastError: null };
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Printer test failed";
      setError(message);
      throw caught;
    } finally {
      setIsConnecting(false);
    }
  }, []);

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

  const printKitchen = useCallback(
    async (slip: KitchenSlip, stations: StationRoute[] = []) => {
      const current = currentBindings();
      const plan = groupKitchenJobs(
        slip.lines || [],
        current.bindings,
        current.defaultBinding,
        slip.stationId,
        stations
      );
      for (const job of plan.jobs) {
        await qzTrayClient.printKitchen(job.binding, {
          ...slip,
          lines: job.lines,
        });
      }
      return plan.unrouted;
    },
    [currentBindings]
  );

  const printReceipt = useCallback(
    async (receipt: SaleReceipt) => {
      const current = currentBindings();
      const target = current.defaultBinding || current.bindings[0] || null;
      if (!target) throw new Error("No default printer is connected");
      await qzTrayClient.printReceipt(target, {
        ...receipt,
        place: receipt.place || "CHECKOUT",
        showLogo: receipt.place === "FINANCE" ? false : receipt.showLogo,
      });
    },
    [currentBindings]
  );

  const printTicket = useCallback(
    async (ticket: KdsTicket, stations: StationRoute[] = []) => {
      const routed = ticket.stationId
        ? stations.filter((station) => station.id === ticket.stationId)
        : stations;
      return printKitchen(
        {
          title: ticket.ticketNumber || ticket.id,
          status: ticket.status,
          courseType: ticket.courseType,
          firedAt: ticket.firedAt,
          stationId: ticket.stationId,
          orderRef: ticket.salesOrderId,
          lines: ticket.lines,
        },
        routed
      );
    },
    [printKitchen]
  );

  return {
    bindings,
    defaultBinding,
    deviceNames,
    isConnected,
    isConnecting,
    error,
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
