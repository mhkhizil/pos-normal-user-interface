import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindingsForSector,
  getDefaultPrinterBinding,
  readPrinterBindings,
  removeLocalOnlyPrinterBindings,
  removePrinterBinding,
  resolveBindingsForPlace,
  savePrinterBinding,
  takesArea,
} from "../printerBindingStorage";

describe("printer binding storage", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  it("persists and selects a default workstation printer", () => {
    const binding = {
      id: "printer-1",
      backendPrinterId: "printer-1",
      transport: "NETWORK" as const,
      displayName: "Kitchen",
      host: "192.168.1.50",
      port: 9100,
      lastVerifiedAt: "2026-09-22T00:00:00.000Z",
    };

    savePrinterBinding("tenant-1", "register-1", binding, true);

    expect(
      getDefaultPrinterBinding("tenant-1", "register-1")
    ).toMatchObject(binding);
    expect(
      Object.keys(readPrinterBindings("tenant-1", "register-1").bindings)
    ).toEqual(["printer-1"]);
  });

  it("removes the local binding", () => {
    savePrinterBinding(
      "tenant-1",
      "register-1",
      {
        id: "usb-1",
        transport: "USB",
        displayName: "USB Kitchen",
        deviceName: "USB Printer",
        lastVerifiedAt: "2026-09-22T00:00:00.000Z",
      },
      true
    );

    removePrinterBinding("tenant-1", "register-1", "usb-1");

    expect(getDefaultPrinterBinding("tenant-1", "register-1")).toBeNull();
  });

  it("drops printers that were stored only on this device", () => {
    savePrinterBinding(
      "tenant-1",
      "register-1",
      {
        id: "usb-1",
        transport: "USB",
        displayName: "USB Kitchen",
        deviceName: "USB Printer",
        lastVerifiedAt: "2026-09-22T00:00:00.000Z",
      },
      true
    );
    savePrinterBinding("tenant-1", "register-1", {
      id: "net-1",
      backendPrinterId: "printer-1",
      transport: "NETWORK",
      displayName: "Bar",
      host: "192.168.0.20",
      port: 9100,
      lastVerifiedAt: "2026-09-22T00:00:00.000Z",
    });

    removeLocalOnlyPrinterBindings("tenant-1", "register-1");

    expect(
      Object.keys(readPrinterBindings("tenant-1", "register-1").bindings)
    ).toEqual(["net-1"]);
  });

  it("drops legacy local station assignments in favor of backend routing", () => {
    const values = new Map<string, string>();
    values.set(
      "pos:printerBindings:tenant-1:register-1",
      JSON.stringify({
        version: 1,
        bindings: {
          "old-printer": {
            id: "old-printer",
            transport: "USB",
            displayName: "Old kitchen printer",
            deviceName: "Old kitchen printer",
            stationId: "kitchen",
            lastVerifiedAt: "",
          },
        },
      })
    );
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });

    expect(
      readPrinterBindings("tenant-1", "register-1").bindings["old-printer"]
    ).not.toHaveProperty("stationId");
  });

  it("selects local bindings by print sector", () => {
    const checkout = {
      id: "checkout-1",
      backendPrinterId: "printer-checkout",
      transport: "USB" as const,
      displayName: "Counter",
      deviceName: "USB Counter",
      sectors: ["CHECKOUT" as const],
      lastVerifiedAt: "2026-10-02T00:00:00.000Z",
    };
    const finance = {
      id: "finance-1",
      backendPrinterId: "printer-finance",
      transport: "NETWORK" as const,
      displayName: "Office",
      host: "192.168.1.80",
      port: 9100,
      sectors: ["FINANCE" as const, "CHECKOUT" as const],
      lastVerifiedAt: "2026-10-02T00:00:00.000Z",
    };

    expect(bindingsForSector([checkout, finance], "CHECKOUT")).toEqual([
      checkout,
      finance,
    ]);
    expect(bindingsForSector([checkout, finance], "FINANCE")).toEqual([finance]);
    expect(bindingsForSector([checkout, finance], "KDS")).toEqual([]);
  });

  it("only gives a section to a printer that prints it", () => {
    const counter = {
      id: "printer-1",
      backendPrinterId: "printer-1",
      transport: "NETWORK" as const,
      displayName: "Counter",
      host: "192.168.1.50",
      port: 9100,
      sectors: ["CHECKOUT" as const],
      lastVerifiedAt: "",
    };
    // A printer that names no sections is the register's catch-all: the setup
    // from before print sectors existed, or a single-printer till.
    const office = {
      id: "printer-2",
      backendPrinterId: "printer-2",
      transport: "NETWORK" as const,
      displayName: "Office",
      host: "192.168.1.51",
      port: 9100,
      lastVerifiedAt: "",
    };
    const spare = {
      id: "printer-3",
      backendPrinterId: "printer-3",
      transport: "NETWORK" as const,
      displayName: "Spare",
      host: "192.168.1.52",
      port: 9100,
      lastVerifiedAt: "",
    };

    // An exact sector match always wins over the default printer.
    expect(resolveBindingsForPlace([counter, office], office, "CHECKOUT")).toEqual([
      counter,
    ]);
    // A printer that prints other sections never takes this one, even when it is
    // the default: a checkout printer must not print kitchen tickets.
    expect(resolveBindingsForPlace([counter, office], counter, "KDS")).toEqual([
      office,
    ]);
    // A single-printer venue prints everything, even without sector config.
    expect(resolveBindingsForPlace([office], null, "CHECKOUT")).toEqual([office]);
    // Among catch-alls the default printer is preferred.
    expect(resolveBindingsForPlace([office, spare], spare, "FINANCE")).toEqual([
      spare,
    ]);
    // Every printer names its sections and none of them is this one.
    expect(resolveBindingsForPlace([counter], null, "KDS")).toEqual([]);
  });

  it("keeps a KDS-only default printer to kitchen tickets", () => {
    // The bar printer of a venue that also has a counter printer: it prints the
    // tickets of its KDS stations and nothing the counter is configured for.
    const bar = {
      id: "printer-bar",
      backendPrinterId: "printer-bar",
      transport: "NETWORK" as const,
      displayName: "Bar",
      host: "192.168.201.92",
      port: 9100,
      sectors: ["KDS" as const],
      lastVerifiedAt: "",
    };

    expect(resolveBindingsForPlace([bar], bar, "CHECKOUT")).toEqual([]);
    expect(resolveBindingsForPlace([bar], bar, "FINANCE")).toEqual([]);
    expect(resolveBindingsForPlace([bar], bar, "KDS")).toEqual([bar]);
  });

  it("prints a slip on the printers of its own area", () => {
    const bar = {
      id: "printer-bar",
      backendPrinterId: "printer-bar",
      transport: "NETWORK" as const,
      displayName: "Cashier",
      host: "192.168.1.51",
      port: 9100,
      sectors: ["CHECKOUT" as const],
      printsFor: ["BAR" as const],
      lastVerifiedAt: "",
    };
    const ktv = {
      id: "printer-ktv",
      backendPrinterId: "printer-ktv",
      transport: "NETWORK" as const,
      displayName: "KTV counter",
      host: "192.168.1.50",
      port: 9100,
      sectors: ["CHECKOUT" as const, "FINANCE" as const],
      printsFor: ["KTV" as const],
      lastVerifiedAt: "",
    };
    // A printer that names no areas serves every one of them.
    const plain = {
      id: "printer-plain",
      backendPrinterId: "printer-plain",
      transport: "NETWORK" as const,
      displayName: "Counter",
      host: "192.168.1.52",
      port: 9100,
      sectors: ["CHECKOUT" as const],
      lastVerifiedAt: "",
    };

    // Without an area every checkout printer is a candidate, as it was before.
    expect(resolveBindingsForPlace([bar, ktv], bar, "CHECKOUT")).toEqual([bar, ktv]);
    // A KTV guest slip prints on the KTV counter, never on the bar counter.
    expect(resolveBindingsForPlace([bar, ktv], bar, "CHECKOUT", "KTV")).toEqual([ktv]);
    expect(resolveBindingsForPlace([bar, ktv], bar, "CHECKOUT", "BAR")).toEqual([bar]);
    // A printer set up for no area in particular still prints for every area.
    expect(resolveBindingsForPlace([plain], plain, "CHECKOUT", "KTV")).toEqual([plain]);
  });

  it("never narrows kitchen tickets by area", () => {
    // Two station printers, each set up for a different area. Areas are a slip's
    // business, not the kitchen's: both stay candidates for a kitchen ticket.
    const ktvKitchen = {
      id: "printer-kitchen-ktv",
      backendPrinterId: "printer-kitchen-ktv",
      transport: "NETWORK" as const,
      displayName: "KTV kitchen",
      host: "192.168.1.60",
      port: 9100,
      sectors: ["KDS" as const],
      printsFor: ["KTV" as const],
      lastVerifiedAt: "",
    };
    const barKitchen = {
      id: "printer-kitchen-bar",
      backendPrinterId: "printer-kitchen-bar",
      transport: "NETWORK" as const,
      displayName: "Bar kitchen",
      host: "192.168.1.61",
      port: 9100,
      sectors: ["KDS" as const],
      printsFor: ["BAR" as const],
      lastVerifiedAt: "",
    };

    expect(
      resolveBindingsForPlace([ktvKitchen, barKitchen], null, "KDS", "BAR")
    ).toEqual([ktvKitchen, barKitchen]);
    expect(
      resolveBindingsForPlace([ktvKitchen, barKitchen], null, "KDS", "SPA")
    ).toEqual([ktvKitchen, barKitchen]);
    expect(takesArea("KDS")).toBe(false);
    expect(takesArea("CHECKOUT")).toBe(true);
    expect(takesArea("FINANCE")).toBe(true);
  });

  it("resolves duplicate records for one physical printer only once", () => {
    const local = {
      id: "local-counter",
      transport: "NETWORK" as const,
      displayName: "Counter (local)",
      host: "192.168.1.50",
      port: 9100,
      sectors: ["CHECKOUT" as const],
      lastVerifiedAt: "",
    };
    const synced = {
      ...local,
      id: "backend:counter",
      backendPrinterId: "counter",
      displayName: "Counter",
    };

    expect(resolveBindingsForPlace([local, synced], local, "CHECKOUT")).toEqual([
      local,
    ]);
  });

  it("keeps printing when the device denies local storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("localStorage is blocked");
      },
      removeItem: () => undefined,
      clear: () => undefined,
    });

    savePrinterBinding(
      "tenant-blocked",
      "register-blocked",
      {
        id: "blocked-1",
        backendPrinterId: "blocked-1",
        transport: "USB",
        displayName: "Blocked printer",
        deviceName: "USB Printer",
        sectors: ["CHECKOUT"],
        lastVerifiedAt: "",
      },
      true
    );

    expect(
      readPrinterBindings("tenant-blocked", "register-blocked").bindings["blocked-1"]
    ).toMatchObject({ displayName: "Blocked printer" });
    expect(getDefaultPrinterBinding("tenant-blocked", "register-blocked")).toMatchObject(
      { id: "blocked-1" }
    );
  });
});
