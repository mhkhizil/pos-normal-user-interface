import { describe, expect, it } from "vitest";
import {
  resolveBindingsForPlace,
  type PrinterBinding,
} from "@/lib/pos/printerBindingStorage";
import { groupKitchenJobs, type StationRoute } from "../routeKitchenPrint";
import { cardSlip } from "../cardSlip";
import { toTabletSlip } from "@/lib/spa/tabletSlip";
import type { PrintLine } from "../formatKdsTicket";

/**
 * The three printer sections, as the shop sets them up, exercised end to end.
 *
 *   FINANCE  - the office copy, on the printers ticked FINANCE
 *   CHECKOUT - a guest slip, on the printers of the slip's own area
 *              (BAR / KTV / SPA), and nowhere else
 *   KDS      - a kitchen ticket, per item, at the station that carries the
 *              item's category, on that station's printers
 *
 * Every case here is "what the operator expects after ticking the boxes".
 */

let sequence = 0;
const printer = (
  id: string,
  sectors: PrinterBinding["sectors"],
  printsFor?: PrinterBinding["printsFor"]
): PrinterBinding => {
  sequence += 1;
  return {
    id,
    backendPrinterId: id,
    transport: "NETWORK",
    displayName: id,
    host: `10.9.0.${sequence}`,
    port: 9100,
    sectors,
    ...(printsFor ? { printsFor } : {}),
    lastVerifiedAt: "",
  };
};

const station = (
  id: string,
  name: string,
  printerIds: string[],
  categoryIds: string[]
): StationRoute => ({ id, name, printerIds, categoryIds });

const line = (name: string, categoryId?: string): PrintLine => ({
  name,
  quantity: "1",
  ...(categoryId ? { categoryId } : {}),
});

const ids = (bindings: PrinterBinding[]) => bindings.map((binding) => binding.id).sort();

// The shop's printers, one per section and area.
const barCheckout = printer("Bar counter", ["CHECKOUT"], ["BAR"]);
const ktvCheckout = printer("KTV counter", ["CHECKOUT"], ["KTV"]);
const spaCheckout = printer("SPA counter", ["CHECKOUT"], ["SPA"]);
const finance = printer("Office", ["FINANCE"], ["BAR"]);
const kdsChinese = printer("Chinese KDS", ["KDS"]);
const kdsDrinks = printer("Beverage KDS", ["KDS"]);
const all = [barCheckout, ktvCheckout, spaCheckout, finance, kdsChinese, kdsDrinks];

describe("CHECKOUT: a guest slip prints on the counter of its own area", () => {
  it("sends a BAR bill to the BAR counter only", () => {
    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "BAR"))).toEqual([
      "Bar counter",
    ]);
  });

  it("sends a KTV bill to the KTV counter only", () => {
    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "KTV"))).toEqual([
      "KTV counter",
    ]);
  });

  it("sends a SPA bill to the SPA counter only", () => {
    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", "SPA"))).toEqual([
      "SPA counter",
    ]);
  });

  it("never sends a checkout slip to a KDS or finance printer", () => {
    for (const area of ["BAR", "KTV", "SPA"] as const) {
      const routed = ids(resolveBindingsForPlace(all, null, "CHECKOUT", area));
      expect(routed).not.toContain("Chinese KDS");
      expect(routed).not.toContain("Beverage KDS");
      expect(routed).not.toContain("Office");
    }
  });

  it("prints on every counter ticked for the area", () => {
    const barAndKtv = printer("Bar and KTV counter", ["CHECKOUT"], ["BAR", "KTV"]);
    expect(
      ids(resolveBindingsForPlace([barCheckout, barAndKtv], null, "CHECKOUT", "KTV"))
    ).toEqual(["Bar and KTV counter"]);
    expect(
      ids(resolveBindingsForPlace([barCheckout, barAndKtv], null, "CHECKOUT", "BAR"))
    ).toEqual(["Bar and KTV counter", "Bar counter"]);
  });

  it("prints on a counter that names no area when no counter serves the area", () => {
    const unticked = printer("Old counter", ["CHECKOUT"], []);
    expect(ids(resolveBindingsForPlace([unticked], null, "CHECKOUT", "KTV"))).toEqual([
      "Old counter",
    ]);
  });

  it("prints on another area's counter rather than nowhere", () => {
    // The KTV counter is missing; the guest is standing at the bar.
    expect(ids(resolveBindingsForPlace([barCheckout], null, "CHECKOUT", "KTV"))).toEqual([
      "Bar counter",
    ]);
  });

  it("puts a card top-up on the till's own counter", () => {
    const slip = cardSlip("CARD TOP-UP", "Top-up", {
      receiptId: "GC-1",
      cardNumber: "1002 3004",
      amount: "10000",
      balanceAfter: "30000",
      printedAt: "2026-11-10 12:00",
    });

    expect(slip.area).toBe("BAR");
    expect(ids(resolveBindingsForPlace(all, null, "CHECKOUT", slip.area))).toEqual([
      "Bar counter",
    ]);
  });
});

describe("FINANCE: the office copy prints on the finance printers", () => {
  it("sends the office copy to the FINANCE printer only", () => {
    expect(ids(resolveBindingsForPlace(all, null, "FINANCE", "BAR"))).toEqual(["Office"]);
  });

  it("never sends the office copy to a checkout or KDS printer", () => {
    const routed = ids(resolveBindingsForPlace(all, null, "FINANCE", "KTV"));
    expect(routed).not.toContain("Bar counter");
    expect(routed).not.toContain("KTV counter");
    expect(routed).not.toContain("Chinese KDS");
  });

  it("takes the area into account for the finance printer too", () => {
    const ktvOffice = printer("KTV office", ["FINANCE"], ["KTV"]);
    expect(
      ids(resolveBindingsForPlace([finance, ktvOffice], null, "FINANCE", "KTV"))
    ).toEqual(["KTV office"]);
    expect(
      ids(resolveBindingsForPlace([finance, ktvOffice], null, "FINANCE", "BAR"))
    ).toEqual(["Office"]);
  });
});

describe("KDS: each item prints at the station that carries its category", () => {
  const chineseStation = station("st-chinese", "Chinese KDS", ["Chinese KDS"], ["cat-chinese"]);
  const drinksStation = station("st-drinks", "Beverage KDS", ["Beverage KDS"], ["cat-drinks"]);
  const stations = [chineseStation, drinksStation];
  const bound = all;

  it("splits a fried noodle and a beer onto their own station printers", () => {
    const plan = groupKitchenJobs(
      [line("Chinese fried noodle", "cat-chinese"), line("Beer", "cat-drinks")],
      bound,
      barCheckout,
      undefined,
      stations
    );

    const printed = Object.fromEntries(
      plan.jobs.map((job) => [
        job.binding.displayName,
        job.lines.map((item) => item.name).sort(),
      ])
    );
    expect(printed).toEqual({
      "Chinese KDS": ["Chinese fried noodle"],
      "Beverage KDS": ["Beer"],
    });
    expect(plan.unrouted).toEqual([]);
    expect(plan.missingPrinterRoutes).toEqual([]);
    expect(plan.jobs.map((job) => job.binding.displayName)).not.toContain("Bar counter");
  });

  it("keeps two items of the same category on one ticket, at one station", () => {
    const plan = groupKitchenJobs(
      [line("Fried noodle", "cat-chinese"), line("Spring roll", "cat-chinese")],
      bound,
      barCheckout,
      undefined,
      stations
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].binding.displayName).toBe("Chinese KDS");
    expect(plan.jobs[0].lines.map((item) => item.name)).toEqual([
      "Fried noodle",
      "Spring roll",
    ]);
  });

  it("routes a room tablet's order by each item's category", () => {
    // The tablet sends a category per item; the ticket must reach that station.
    const slip = toTabletSlip({
      id: "ro-1",
      orderNumber: 4,
      source: "TABLET",
      kind: "ITEMS",
      roomNumber: "S2",
      roomName: null,
      spaSessionId: "session-1",
      amount: "12000",
      deviceName: "Lounge 1",
      createdAt: "2026-11-10T12:00:00.000Z",
      acknowledgedAt: null,
      deliveredAt: null,
      printClaimedAt: null,
      items: [
        { name: "Chinese fried noodle", quantity: 1, status: "PENDING", categoryId: "cat-chinese" },
        { name: "Beer", quantity: 2, status: "PENDING", categoryId: "cat-drinks" },
      ],
    });

    const plan = groupKitchenJobs(slip.lines || [], bound, barCheckout, undefined, stations);
    const printed = Object.fromEntries(
      plan.jobs.map((job) => [
        job.binding.displayName,
        job.lines.map((item) => item.name),
      ])
    );

    expect(printed).toEqual({
      "Chinese KDS": ["Chinese fried noodle"],
      "Beverage KDS": ["Beer"],
    });
    expect(plan.unrouted).toEqual([]);
    expect(plan.jobs.map((job) => job.binding.displayName)).not.toContain("Bar counter");
  });

  it("prints a category shared by two stations on their one printer, once", () => {
    const bar = station("st-bar", "Bar", ["Beverage KDS"], ["cat-drinks"]);
    const expo = station("st-expo", "Expo", ["Beverage KDS"], ["cat-drinks", "cat-food"]);
    const plan = groupKitchenJobs(
      [line("Beer", "cat-drinks")],
      bound,
      barCheckout,
      undefined,
      [bar, expo]
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].binding.displayName).toBe("Beverage KDS");
    expect(plan.jobs[0].lines.map((item) => item.name)).toEqual(["Beer"]);
  });

  it("reports an item whose category no station carries, and prints the rest", () => {
    const plan = groupKitchenJobs(
      [line("Fried noodle", "cat-chinese"), line("Mystery dish", "cat-unknown")],
      bound,
      barCheckout,
      undefined,
      stations
    );

    expect(plan.jobs.map((job) => job.binding.displayName)).toEqual(["Chinese KDS"]);
    expect(plan.unrouted.map((item) => item.name)).toEqual(["Mystery dish"]);
  });

  it("reports an item that carries no category at all", () => {
    const plan = groupKitchenJobs(
      [line("Uncategorised dish")],
      bound,
      barCheckout,
      undefined,
      stations
    );

    expect(plan.jobs).toEqual([]);
    expect(plan.unrouted.map((item) => item.name)).toEqual(["Uncategorised dish"]);
  });

  it("names the station whose printer this till does not have", () => {
    const plan = groupKitchenJobs(
      [line("Fried noodle", "cat-chinese")],
      [barCheckout, kdsDrinks],
      barCheckout,
      undefined,
      stations
    );

    expect(plan.jobs).toEqual([]);
    expect(plan.unrouted.map((item) => item.name)).toEqual(["Fried noodle"]);
    expect(plan.missingPrinterRoutes).toEqual([
      { stationId: "st-chinese", stationName: "Chinese KDS", printerIds: ["Chinese KDS"] },
    ]);
  });

  it("prints nothing at a station with no category, so its items are unrouted", () => {
    const emptyStation = station("st-empty", "Empty KDS", ["Chinese KDS"], []);
    const plan = groupKitchenJobs(
      [line("Fried noodle", "cat-chinese")],
      bound,
      barCheckout,
      undefined,
      [emptyStation]
    );

    expect(plan.jobs).toEqual([]);
    expect(plan.unrouted.map((item) => item.name)).toEqual(["Fried noodle"]);
  });

  it("never falls back to the till printer while stations are set up", () => {
    const plan = groupKitchenJobs(
      [line("Mystery dish", "cat-unknown")],
      bound,
      barCheckout,
      undefined,
      stations,
      { requireStationRouting: true }
    );

    expect(plan.jobs).toEqual([]);
    expect(plan.unrouted.map((item) => item.name)).toEqual(["Mystery dish"]);
  });

  it("routes a ticket that already names its station to that station's printer", () => {
    const plan = groupKitchenJobs(
      [line("Fried noodle", "cat-chinese"), line("Beer", "cat-drinks")],
      bound,
      barCheckout,
      "st-drinks",
      stations
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].binding.displayName).toBe("Beverage KDS");
    expect(plan.jobs[0].lines).toHaveLength(2);
  });
});
