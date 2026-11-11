import { describe, expect, it } from "vitest";
import type { KitchenPrinter } from "@/core/domain/entities/KitchenPrinter";
import type { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import {
  unboundStationPrinterIds,
  withStationPrinters,
} from "../stationPrinterBindings";

const saved = (id: string, backendPrinterId: string, host: string): PrinterBinding => ({
  id,
  backendPrinterId,
  transport: "NETWORK",
  displayName: id,
  host,
  port: 9100,
  sectors: ["KDS"],
  lastVerifiedAt: "",
});

const printer = (id: string, ipAddress: string | undefined, isActive = true) =>
  ({
    id,
    name: id,
    ipAddress,
    port: 9100,
    sectors: ["KDS"],
    printsFor: [],
    isActive,
  }) as unknown as KitchenPrinter;

describe("unboundStationPrinterIds", () => {
  it("names each station printer the device has not saved, once", () => {
    const stations = [
      { id: "a", name: "A", printerIds: ["p1", "p2"], categoryIds: [] },
      { id: "b", name: "B", printerIds: ["p2", "p3"], categoryIds: [] },
    ];
    expect(unboundStationPrinterIds(stations, [saved("x", "p1", "10.0.0.1")])).toEqual([
      "p2",
      "p3",
    ]);
  });
});

describe("withStationPrinters", () => {
  it("leaves the bindings alone when nothing is missing", () => {
    const bindings = [saved("x", "p1", "10.0.0.1")];
    expect(withStationPrinters(bindings, [], [])).toBe(bindings);
  });

  it("reuses the saved printer at the record's address, under the same id", () => {
    const bindings = [saved("kitchen", "wt-kitchen", "10.0.0.1")];
    const result = withStationPrinters(
      bindings,
      [printer("vip-kitchen", "10.0.0.1")],
      ["vip-kitchen"]
    );
    expect(result[1]).toMatchObject({ id: "kitchen", backendPrinterId: "vip-kitchen" });
  });

  it("adds an active record at an address nothing saved, once per address", () => {
    const result = withStationPrinters(
      [],
      [printer("a", "10.0.0.2"), printer("b", "10.0.0.2")],
      ["a", "b"]
    );
    expect(result.map((binding) => [binding.id, binding.backendPrinterId])).toEqual([
      ["backend:a", "a"],
      ["backend:a", "b"],
    ]);
  });

  it("skips records with no address, unknown ids and inactive printers", () => {
    const result = withStationPrinters(
      [],
      [printer("noip", undefined), printer("off", "10.0.0.3", false)],
      ["noip", "off", "gone"]
    );
    expect(result).toEqual([]);
  });
});
