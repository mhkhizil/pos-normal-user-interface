import { describe, expect, it } from "vitest";
import {
  resolveBindingsForPlace,
  type PrinterArea,
  type PrinterBinding,
  type PrinterSector,
} from "@/lib/pos/printerBindingStorage";

/**
 * A checkout slip belongs to one area of the venue. A printer that names the
 * areas it prints for takes only those slips; a printer that names none serves
 * every area. The question these cases pin down is what happens when BOTH kinds
 * of printer are bound: does the area-less printer still get the slip, or does
 * the area printer win?
 */
const binding = (
  id: string,
  sector: PrinterSector,
  printsFor: PrinterArea[],
  host: string
): PrinterBinding => ({
  id,
  transport: "NETWORK",
  displayName: id,
  host,
  port: 9100,
  sectors: [sector],
  printsFor,
  lastVerifiedAt: "",
});

const ids = (bindings: PrinterBinding[]): string[] =>
  bindings.map((entry) => entry.id).sort();

const anywhere = binding("Anywhere", "CHECKOUT", [], "10.0.0.13");
const bar = binding("Bar", "CHECKOUT", ["BAR"], "10.0.0.11");
const ktv = binding("KTV", "CHECKOUT", ["KTV"], "10.0.0.12");

describe("checkout slip routing by area", () => {
  it("case 1a: bar(BAR) + ktv(KTV) + anywhere([]) keeps the KTV slip off anywhere", () => {
    const all = [bar, ktv, anywhere];

    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "KTV"))).toEqual([
      "KTV",
    ]);
  });

  it("case 1b: bar(BAR) + ktv(KTV) + anywhere([]) keeps the BAR slip off anywhere", () => {
    const all = [bar, ktv, anywhere];

    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "BAR"))).toEqual([
      "Bar",
    ]);
  });

  it("case 2: bar(BAR) + ktv(KTV) sends each area only its printer", () => {
    const all = [bar, ktv];

    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "KTV"))).toEqual([
      "KTV",
    ]);
    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "BAR"))).toEqual([
      "Bar",
    ]);
  });

  it("case 3: anywhere([]) + ktv(KTV) must not leak the KTV slip to anywhere", () => {
    const all = [anywhere, ktv];

    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "KTV"))).toEqual([
      "KTV",
    ]);
  });

  it("case 4: an area-less printer alone still prints every area's slip", () => {
    expect(
      ids(resolveBindingsForPlace([anywhere], anywhere, "CHECKOUT", "KTV"))
    ).toEqual(["Anywhere"]);
  });

  it("case 5: an area printer alone is preferred over silence", () => {
    expect(ids(resolveBindingsForPlace([bar], bar, "CHECKOUT", "KTV"))).toEqual([
      "Bar",
    ]);
  });

  it("case 6: bar(BAR) + ktv([]) lets the area-less KTV printer print the KTV slip", () => {
    const ktvNoArea = binding("KTV", "CHECKOUT", [], "10.0.0.14");
    const all = [bar, ktvNoArea];

    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "KTV"))).toEqual([
      "KTV",
    ]);
  });

  it("case 7: kds(KDS, printsFor BAR) still takes KTV kitchen tickets", () => {
    const kds = binding("KDS", "KDS", ["BAR"], "10.0.0.15");
    const all = [kds, ktv];

    const routed = ids(resolveBindingsForPlace(all, null, "KDS", "KTV"));
    expect(routed).toContain("KDS");
    expect(routed).toEqual(["KDS"]);
  });

  it("case 8: finance slips go only to the finance printer of that area", () => {
    const office = binding("Office", "FINANCE", ["BAR"], "10.0.0.16");
    const ktvOffice = binding("ktvOffice", "FINANCE", ["KTV"], "10.0.0.17");
    const all = [office, ktvOffice];

    expect(ids(resolveBindingsForPlace(all, null, "FINANCE", "KTV"))).toEqual([
      "ktvOffice",
    ]);
  });

  /**
   * A printer that names no section at all is the register's catch-all, and it only
   * takes a slip when no printer names that section - the rule that keeps the till's
   * default printer off kitchen tickets. Naming an area does not turn a catch-all
   * into a checkout printer, so it never displaces the counter that names CHECKOUT.
   */
  it("case 9: a section-less printer never displaces the counter that names the section", () => {
    const legacy: PrinterBinding = {
      ...binding("Legacy", "CHECKOUT", ["BAR"], "10.0.0.18"),
      sectors: [],
    };

    expect(ids(resolveBindingsForPlace([anywhere, legacy], null, "CHECKOUT", "BAR"))).toEqual([
      "Anywhere",
    ]);
    // The register's catch-all is still the printer of last resort.
    expect(ids(resolveBindingsForPlace([legacy], null, "CHECKOUT", "BAR"))).toEqual([
      "Legacy",
    ]);
  });
});
