import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { savePrinterBinding } from "@/lib/pos/printerBindingStorage";
import { KdsStation, KdsTicket } from "@/core/domain/entities/Cashier";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  printKitchen: vi.fn(),
  printReceipt: vi.fn(),
  listTemplates: vi.fn(),
  listPrinters: vi.fn(),
  company: vi.fn(),
}));

vi.mock("@/core/infrastructure/printing/getPrinterClient", () => ({
  getPrinterClient: async () => ({
    isConnected: () => true,
    connect: mocks.connect,
    disconnect: vi.fn(),
    findPrinters: vi.fn().mockResolvedValue([]),
    testPrint: vi.fn(),
    printKdsTicket: vi.fn(),
    printKitchen: mocks.printKitchen,
    printReceipt: mocks.printReceipt,
  }),
}));

vi.mock("@/core/infrastructure/di/container", () => ({
  default: {
    resolve: (key: string) => {
      if (key === "printTemplateService") {
        return {
          list: mocks.listTemplates,
          resolve: vi.fn().mockResolvedValue({ settings: undefined }),
          company: mocks.company,
        };
      }
      if (key === "kitchenPrinterService") {
        return { list: mocks.listPrinters };
      }
      if (key === "salesOrderService") {
        return { getSalesOrderLines: vi.fn().mockResolvedValue({ lines: [] }) };
      }
      return {
        list: vi.fn().mockResolvedValue({ printers: [] }),
        resolve: vi.fn().mockResolvedValue({ settings: undefined }),
        company: mocks.company,
        get: vi.fn().mockResolvedValue({ currency: "MMK" }),
      };
    },
  },
}));

import { usePrinterConnection } from "../usePrinterConnection";

const tenantId = "tenant-print-matrix";
const registerId = "register-1";

const bind = (id: string, over: Record<string, unknown>) =>
  savePrinterBinding(
    tenantId,
    registerId,
    {
      id,
      transport: "NETWORK",
      displayName: id,
      host: `10.1.0.${id.length}`,
      port: 9100,
      lastVerifiedAt: "",
      ...over,
    },
    false
  );

const printedOn = () =>
  mocks.printReceipt.mock.calls.map(([binding]) => binding.displayName);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue(undefined);
  mocks.printReceipt.mockResolvedValue(undefined);
  mocks.printKitchen.mockResolvedValue(undefined);
  mocks.listTemplates.mockResolvedValue({ templates: [] });
  mocks.listPrinters.mockResolvedValue({ printers: [] });
  mocks.company.mockResolvedValue({ name: "Golden Club" });
});

describe("a guest slip keeps to its own area", () => {
  it("prints the KTV bill on the KTV counter, never the bar's", async () => {
    bind("Bar till", { sectors: ["CHECKOUT"], printsFor: ["BAR"] });
    bind("KTV till", { sectors: ["CHECKOUT"], printsFor: ["KTV"] });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printReceipt({
        title: "RECEIPT",
        lines: [],
        total: "1000",
        area: "KTV",
      });
    });

    expect(printedOn()).toEqual(["KTV till"]);
  });

  it("prints a bar bill on the bar counter, never the KTV's", async () => {
    bind("Bar till", { sectors: ["CHECKOUT"], printsFor: ["BAR"] });
    bind("KTV till", { sectors: ["CHECKOUT"], printsFor: ["KTV"] });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printReceipt({
        title: "RECEIPT",
        lines: [],
        total: "1000",
        area: "BAR",
      });
    });

    expect(printedOn()).toEqual(["Bar till"]);
  });
});

describe("a fired ticket reaches the station, not the till", () => {
  it("prints only on the station printer of a sector-declared pair", async () => {
    bind("Till", { sectors: ["CHECKOUT"] });
    bind("Hot line", {
      backendPrinterId: "printer-hot",
      sectors: ["KDS"],
    });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    const ticket = new KdsTicket({
      id: "ticket-1",
      ticketNumber: "KDS-0007",
      salesOrderId: "order-1",
      stationId: "station-hot",
      status: "PENDING",
      place: { kind: "TABLE", number: "T4", name: null, guestCount: 2 },
      station: new KdsStation({
        id: "station-hot",
        name: "Hot line",
        printerIds: ["printer-hot"],
      }),
      lines: [{ name: "Steak", quantity: "1" }],
    });

    await act(async () => {
      await result.current.printTicket(ticket, [
        {
          id: "station-hot",
          name: "Hot line",
          printerIds: ["printer-hot"],
          categoryIds: ["food"],
        },
      ]);
    });

    expect(mocks.printKitchen).toHaveBeenCalledTimes(1);
    const [binding, slip] = mocks.printKitchen.mock.calls[0];
    expect(binding.displayName).toBe("Hot line");
    expect(slip.place).toBe("Table T4");
    expect(slip.lines.map((line: { name: string }) => line.name)).toEqual(["Steak"]);
    expect(mocks.printReceipt).not.toHaveBeenCalled();
  });
});
