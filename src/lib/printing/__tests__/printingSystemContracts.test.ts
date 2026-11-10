import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { KdsStation, KdsTicket } from "@/core/domain/entities/Cashier";
import {
  PRINTER_AREAS,
  PRINTER_SECTORS,
  type PrinterSector,
} from "@/core/domain/entities/KitchenPrinter";
import {
  defaultPrintTemplateSettings,
  PRINT_TEMPLATE_TYPES,
} from "@/core/domain/entities/PrintTemplate";
import { API_ENDPOINTS } from "@/core/infrastructure/api/constants";
import {
  buildKitchenSlipLines,
  formatKitchenSlip,
  formatPrinterTest,
  kdsTicketPlace,
  kdsTicketPlaceDetail,
  kdsTicketSender,
  kdsTicketSlip,
  printAmount,
  printMoney,
  type PrintPlace,
  type SaleReceipt,
} from "@/lib/printing/formatKdsTicket";
import {
  chunkBytes,
  encodeEscPos,
  escPosToBase64,
} from "@/lib/printing/escPosBytes";
import {
  groupKitchenJobs,
  type StationRoute,
} from "@/lib/printing/routeKitchenPrint";
import { checkoutCopies, copySlip } from "@/lib/printing/receiptCopies";
import {
  printPlaceToTemplateType,
  templateTypeToPrintPlace,
} from "@/lib/printing/selectPrintTemplate";
import {
  resolveBindingsForPlace,
  takesArea,
  type PrinterBinding,
} from "@/lib/pos/printerBindingStorage";
import en from "@/lib/i18n/locales/en.json";
import my from "@/lib/i18n/locales/my.json";

const PLACES: PrintPlace[] = ["KDS", "CHECKOUT", "FINANCE"];

/** A distinct address per binding: one physical printer would otherwise be
 * collected once, however many of its bindings there are. */
let bindingSequence = 0;
const binding = (over: Partial<PrinterBinding> & { id: string }): PrinterBinding => {
  bindingSequence += 1;
  return {
    transport: "NETWORK",
    displayName: over.id,
    host: `10.0.0.${bindingSequence}`,
    port: 9100,
    lastVerifiedAt: "",
    ...over,
  };
};

const ticket = (over: Partial<KdsTicket> = {}) =>
  new KdsTicket({
    id: "ticket-1",
    ticketNumber: "KDS-0001",
    salesOrderId: "order-1",
    stationId: "station-hot",
    status: "PENDING",
    ...over,
  });

describe("a print place is one section, one template and one paper size", () => {
  it("names only sectors a printer can be configured for", () => {
    // A new place that is not a printer sector would print nowhere at all.
    for (const place of PLACES) {
      expect(PRINTER_SECTORS).toContain(place as PrinterSector);
    }
    expect([...PRINTER_SECTORS].sort()).toEqual([...PLACES].sort());
  });

  it("maps each place to a template type and back", () => {
    expect(printPlaceToTemplateType("KDS")).toBe("KITCHEN");
    expect(printPlaceToTemplateType("CHECKOUT")).toBe("RECEIPT");
    expect(printPlaceToTemplateType("FINANCE")).toBe("FINANCE");
    for (const place of PLACES) {
      const type = printPlaceToTemplateType(place);
      expect(PRINT_TEMPLATE_TYPES).toContain(type);
      expect(templateTypeToPrintPlace(type)).toBe(place);
    }
    // A shift report is a checkout slip: it prints on the till's own printer.
    expect(templateTypeToPrintPlace("SHIFT")).toBe("CHECKOUT");
  });

  it("knows which places belong to an area of the venue", () => {
    expect(takesArea("CHECKOUT")).toBe(true);
    expect(takesArea("FINANCE")).toBe(true);
    expect(takesArea("KDS")).toBe(false);
    expect([...PRINTER_AREAS].sort()).toEqual(["BAR", "KTV", "SPA"]);
  });
});

describe("a printer only takes the slips it is set up for", () => {
  const kds = binding({ id: "KDS", sectors: ["KDS"] });
  const till = binding({ id: "Till", sectors: ["CHECKOUT"] });
  const office = binding({ id: "Office", sectors: ["FINANCE"] });
  const barTill = binding({
    id: "Bar till",
    sectors: ["CHECKOUT"],
    printsFor: ["BAR"],
  });
  const ktvTill = binding({
    id: "KTV till",
    sectors: ["CHECKOUT"],
    printsFor: ["KTV"],
  });
  const anywhere = binding({ id: "Anywhere", sectors: ["CHECKOUT"], printsFor: [] });

  const names = (bindings: PrinterBinding[]) => bindings.map((item) => item.id);

  it("keeps each section on its own printers", () => {
    const all = [kds, till, office, barTill, ktvTill, anywhere];
    expect(names(resolveBindingsForPlace(all, null, "KDS"))).toEqual(["KDS"]);
    expect(names(resolveBindingsForPlace(all, null, "FINANCE"))).toEqual(["Office"]);
    // A KDS printer must never take the guest's bill.
    expect(names(resolveBindingsForPlace(all, null, "CHECKOUT"))).not.toContain("KDS");
  });

  it("sends a guest slip to its own area's counter, not another area's", () => {
    const all = [barTill, ktvTill, anywhere];
    const ktvSlip = names(resolveBindingsForPlace(all, null, "CHECKOUT", "KTV"));
    const barSlip = names(resolveBindingsForPlace(all, null, "CHECKOUT", "BAR"));
    // A printer set up for the area beats one that names no area at all: an
    // unticked bar counter must not take the KTV's slip alongside the KTV's own.
    expect(ktvSlip).toEqual(["KTV till"]);
    expect(barSlip).toEqual(["Bar till"]);
    expect(ktvSlip).not.toContain("Bar till");
    expect(barSlip).not.toContain("KTV till");
    // With no printer of that area, a printer that names no areas serves it.
    expect(names(resolveBindingsForPlace([anywhere], null, "CHECKOUT", "KTV"))).toEqual([
      "Anywhere",
    ]);
  });

  it("still prints on the only printer there is, even for another area", () => {
    // Silence is worse than the wrong counter: the guest is standing right there.
    expect(names(resolveBindingsForPlace([barTill], null, "CHECKOUT", "KTV"))).toEqual([
      "Bar till",
    ]);
  });

  it("never narrows a kitchen ticket by area", () => {
    // Kitchen tickets have no area: the bar's printer still takes the KTV's food.
    const barKds = binding({ id: "Bar KDS", sectors: ["KDS"], printsFor: ["BAR"] });
    expect(names(resolveBindingsForPlace([barKds], null, "KDS", "KTV"))).toEqual([
      "Bar KDS",
    ]);
  });

  it("falls back to a printer that names no section, preferring the default", () => {
    const spare = binding({ id: "Spare" });
    const chosen = binding({ id: "Chosen" });
    expect(names(resolveBindingsForPlace([spare, chosen], null, "CHECKOUT"))).toEqual([
      "Spare",
      "Chosen",
    ]);
    expect(
      names(resolveBindingsForPlace([spare, chosen], chosen, "CHECKOUT"))
    ).toEqual(["Chosen"]);
  });
});

describe("a busy kitchen routes every item to paper", () => {
  const stations: StationRoute[] = [
    { id: "hot", name: "Hot line", printerIds: ["p-hot"], categoryIds: ["food"] },
    { id: "bar", name: "Bar", printerIds: ["p-bar"], categoryIds: ["drink"] },
    {
      id: "expo",
      name: "Expo",
      printerIds: ["p-bar"],
      categoryIds: ["food", "drink"],
    },
  ];
  const bindings = [
    binding({ id: "b-hot", backendPrinterId: "p-hot", sectors: ["KDS"] }),
    binding({ id: "b-bar", backendPrinterId: "p-bar", sectors: ["KDS"] }),
  ];
  const lines = [
    { name: "Steak", quantity: "1", categoryId: "food" },
    { name: "Rice", quantity: "2", categoryId: "food" },
    { name: "Beer", quantity: "3", categoryId: "drink" },
    { name: "Mystery", quantity: "1", categoryId: "unassigned" },
  ];

  const plan = groupKitchenJobs(lines, bindings, null, undefined, stations, {
    requireStationRouting: true,
  });

  const printedOn = (name: string) =>
    plan.jobs
      .filter((job) => job.lines.some((line) => line.name === name))
      .map((job) => job.binding.id)
      .sort();

  it("prints every item of an assigned category, and only once per printer", () => {
    expect(printedOn("Steak")).toEqual(["b-bar", "b-hot"]);
    expect(printedOn("Rice")).toEqual(["b-bar", "b-hot"]);
    // The bar and the expo share one printer: the drink prints on it once.
    expect(printedOn("Beer")).toEqual(["b-bar"]);
    expect(plan.unrouted.map((line) => line.name)).toEqual(["Mystery"]);
  });

  it("never drops an item silently: every line is printed or reported", () => {
    const printed = plan.jobs.flatMap((job) => job.lines.map((line) => line.name));
    const reported = plan.unrouted.map((line) => line.name);
    for (const line of lines) {
      const seen = printed.filter((name) => name === line.name).length;
      expect(seen + reported.filter((name) => name === line.name).length).toBeGreaterThan(0);
    }
    expect(plan.missingPrinterRoutes).toEqual([]);
  });

  it("reports the station whose printer this till does not know", () => {
    const plan = groupKitchenJobs(
      [{ name: "Steak", quantity: "1", categoryId: "food" }],
      [binding({ id: "b-bar", backendPrinterId: "p-bar", sectors: ["KDS"] })],
      null,
      undefined,
      stations,
      { requireStationRouting: true }
    );
    // The expo printer still has it; the hot line's printer is named as missing
    // so the cashier can fix that till's setup instead of losing the ticket.
    expect(plan.jobs.map((job) => job.binding.id)).toEqual(["b-bar"]);
    expect(plan.unrouted).toEqual([]);
    expect(plan.missingPrinterRoutes).toEqual([
      { stationId: "hot", stationName: "Hot line", printerIds: ["p-hot"] },
    ]);
  });
});

describe("the bytes that reach the paper", () => {
  const kitchen = kdsTicketSlip(
    ticket({
      station: new KdsStation({
        id: "station-hot",
        name: "Hot line",
        printerIds: ["p-hot"],
      }),
      place: { kind: "TABLE", number: "T1", name: null, guestCount: 2 },
      lines: [{ name: "Coffee", quantity: "2", modifiers: "Oat milk" }],
    })
  );
  const bytes = encodeEscPos(formatKitchenSlip(kitchen));

  it("starts every slip with ESC/POS init and a reset size", () => {
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x1b, 0x40, 0x1d, 0x21, 0x00]);
  });

  it("prints the station, the place and the item", () => {
    const text = buildKitchenSlipLines(kitchen).join("\n");
    expect(text).toContain("HOT LINE");
    expect(text).toContain("Table T1");
    expect(text).toContain("2 x COFFEE");
    expect(text).toContain("Oat milk");
  });

  it("keeps printer command bytes and encodes Burmese as UTF-8", () => {
    expect(Array.from(encodeEscPos("\x1b\x1d\x00"))).toEqual([27, 29, 0]);
    const burmese = "ဆိုင်တွင်စား";
    const encoded = encodeEscPos(burmese);
    expect(encoded.every((byte) => byte > 0x7f)).toBe(true);
    expect(encoded.length).toBe(new TextEncoder().encode(burmese).length);
    expect(new TextDecoder().decode(encoded)).toBe(burmese);
  });

  it("chunks without losing a byte", () => {
    const value = "x".repeat(1_200);
    const chunks = chunkBytes(encodeEscPos(value), 512);
    expect(chunks.map((chunk) => chunk.length)).toEqual([512, 512, 176]);
    const rejoined = chunks.reduce((total, chunk) => total + chunk.length, 0);
    expect(rejoined).toBe(encodeEscPos(value).length);
  });

  it("hands the transport exactly the bytes it would send", () => {
    const slip = formatPrinterTest("Hot line");
    const base64 = escPosToBase64(slip);
    const decoded = atob(base64);
    expect(decoded.length).toBe(encodeEscPos(slip).length);
    expect(slip).toContain("PRINTER TEST");
    expect(slip).toContain("Hot line");
    expect(slip).toContain("Connection verified");
  });
});

describe("a paid bill prints the copies the shop chose", () => {
  const settings = (copies: string[]) => {
    const value = defaultPrintTemplateSettings();
    value.copies = copies;
    return value;
  };
  const receipt = (): SaleReceipt => ({
    title: "RECEIPT",
    sale: true,
    lines: [{ name: "Coffee", quantity: "1", unitPrice: "1000" }],
    total: "1000",
    company: { name: "Golden" },
    outletName: "Yankin",
  });

  it("puts the guest's copy first, whatever order the template lists", () => {
    expect(checkoutCopies(settings(["FINANCE", "ORDER_RECEIPT", "CUSTOMER"]))).toEqual([
      "CUSTOMER",
      "ORDER_RECEIPT",
      "FINANCE",
    ]);
  });

  it("prints the guest's copy when the shop chose none, and ignores strangers", () => {
    expect(checkoutCopies()).toEqual(["CUSTOMER"]);
    expect(checkoutCopies(settings([]))).toEqual(["CUSTOMER"]);
    expect(checkoutCopies(settings(["ANOTHER"]))).toEqual(["CUSTOMER"]);
  });

  it("strips the office copy down to money, with no logo or shop header", () => {
    const finance = copySlip(receipt(), "FINANCE");
    expect(finance.place).toBe("FINANCE");
    expect(finance.title).toBe("Finance copy");
    expect(finance.showLogo).toBe(false);
    expect(finance.company).toBeUndefined();
    expect(finance.template).toBeUndefined();
    expect(finance.paperWidth).toBeUndefined();
    expect(finance.logo).toBeUndefined();
  });

  it("names the kitchen copy and leaves the guest's own title alone", () => {
    expect(copySlip(receipt(), "ORDER_RECEIPT").title).toBe("Order receipt");
    expect(copySlip(receipt(), "CUSTOMER").title).toBe("RECEIPT");
  });
});

describe("a kitchen ticket says where the food goes", () => {
  it("names the table, the room, the pickup or the counter", () => {
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "TABLE", number: "12", name: null, guestCount: 2 } })
      )
    ).toBe("Table 12");
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "SPA_ROOM", number: "3", name: "Orchid", guestCount: 1 } })
      )
    ).toBe("SPA 3");
    // A KTV room goes by the company's own name, and still names the room without it.
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "KTV_ROOM", number: "7", name: null, guestCount: 4 } }),
        "Golden Club"
      )
    ).toBe("Golden Club 7");
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "KTV_ROOM", number: "7", name: null, guestCount: 4 } })
      )
    ).toBe("KTV 7");
    expect(
      kdsTicketPlace(
        ticket({
          place: { kind: "COUNTER", number: null, name: null, guestCount: null },
          pickupNumber: "42",
        })
      )
    ).toBe("Pickup 42");
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "COUNTER", number: null, name: null, guestCount: null } })
      )
    ).toBe("Counter");
  });

  it("reads the service and the guests under the place", () => {
    expect(
      kdsTicketPlaceDetail(
        ticket({
          serviceType: "DINE_IN",
          place: { kind: "TABLE", number: "12", name: null, guestCount: 2 },
        })
      )
    ).toBe("Dine-in - 2 guests");
    expect(
      kdsTicketPlaceDetail(
        ticket({
          serviceType: "TAKEAWAY",
          place: { kind: "COUNTER", number: null, name: null, guestCount: null },
        })
      )
    ).toBe("Takeaway");
    // A room's own name and guests, without repeating how it is served.
    expect(
      kdsTicketPlaceDetail(
        ticket({
          serviceType: "DINE_IN",
          place: { kind: "KTV_ROOM", number: "7", name: "Gold", guestCount: 1 },
        })
      )
    ).toBe("Gold - 1 guest");
  });

  it("names who sent it, and a tablet as a tablet", () => {
    expect(
      kdsTicketSender(ticket({ sentBy: { name: "Aung", loginId: "SHW0001" } }))
    ).toBe("Aung (ID: SHW0001)");
    expect(kdsTicketSender(ticket({ sentFrom: "TABLET", deviceName: "Tablet K3" }))).toBe(
      "Tablet K3"
    );
    expect(kdsTicketSender(ticket())).toBeUndefined();
  });
});

describe("money on paper", () => {
  it("prints amounts the way a guest reads them", () => {
    expect(printMoney("50350.0000")).toBe("50,350");
    expect(printMoney("12.5000")).toBe("12.50");
    expect(printMoney("0.0000")).toBe("0");
    expect(printMoney(null)).toBe("");
    expect(printMoney("n/a")).toBe("n/a");
  });

  it("marks dollars, and leaves kyat unmarked", () => {
    expect(printAmount("50350", "MMK")).toBe("50,350");
    expect(printAmount("50350", "USD")).toBe("$ 50,350");
    expect(printAmount("-2825", "USD")).toBe("-$ 2,825");
  });
});

describe("the printer API this till talks to", () => {
  it("keeps the printer and kitchen routes the backend serves", () => {
    expect(API_ENDPOINTS.PRINTERS.LIST).toBe("/api/v1/printers");
    expect(API_ENDPOINTS.PRINTERS.CREATE).toBe("/api/v1/printers");
    expect(API_ENDPOINTS.PRINTERS.BY_ID("p1")).toBe("/api/v1/printers/p1");
    expect(API_ENDPOINTS.PRINTERS.UPDATE("p1")).toBe("/api/v1/printers/p1");
    expect(API_ENDPOINTS.PRINTERS.DELETE("p1")).toBe("/api/v1/printers/p1");
    expect(API_ENDPOINTS.PRINTERS.ATTACH_CATEGORY("p1")).toBe(
      "/api/v1/printers/p1/categories"
    );
    expect(API_ENDPOINTS.PRINTERS.DETACH_CATEGORY("p1", "c1")).toBe(
      "/api/v1/printers/p1/categories/c1"
    );
    expect(API_ENDPOINTS.KDS.FIRE).toBe("/api/v1/kds/fire");
    expect(API_ENDPOINTS.KDS.TICKETS).toBe("/api/v1/kds/tickets");
    expect(API_ENDPOINTS.KDS.STATIONS).toBe("/api/v1/kds/stations");
    expect(API_ENDPOINTS.KDS.STATION("s1")).toBe("/api/v1/kds/stations/s1");
  });
});


const SRC = join(process.cwd(), "src");

/** Every source file under src, leaving out the test files themselves. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

const flatten = (tree: Record<string, unknown>, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path));
    } else if (typeof value === "string") {
      out[path] = value;
    }
  }
  return out;
};

describe("the printer screens are wired for a store that speaks Burmese", () => {
  it("has every printer and slip label in both languages", () => {
    const keys = new Set<string>();
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      // Any quoted key in the printer screens counts, including the label maps
      // and the keys passed to t() through a variable.
      for (const match of text.matchAll(
        /"(settings\.(?:printer|printTemplate)\.[A-Za-z0-9_.]+)"/g
      )) {
        keys.add(match[1]);
      }
    }
    // A missing label prints its key on the screen the staff must read at 2pm.
    expect(keys.size).toBeGreaterThan(20);
    const english = flatten(en as Record<string, unknown>);
    const burmese = flatten(my as Record<string, unknown>);
    const missing = [...keys].filter(
      (key) => !(key in english) || !(key in burmese)
    );
    expect(missing).toEqual([]);
  });
});

describe("printing has one door", () => {
  it("no page or widget talks to a printer transport itself", () => {
    // Everything must go through the printer client behind usePrinterConnection,
    // or a till ends up with a second, untested printing path.
    const offenders = walk(SRC).filter((file) => {
      if (!/[\\/](pages|components|widgets)[\\/]/.test(file)) return false;
      const text = readFileSync(file, "utf8");
      // Reading the installed QZ Tray version for the devices screen is fine;
      // opening a transport from a screen is not.
      return /from\s+["']qz-tray["']|import\(\s*["']qz-tray["']\s*\)|navigator\.usb|navigator\.bluetooth/.test(
        text
      );
    });
    expect(offenders).toEqual([]);
  });

  it("raw printer bytes stay inside the printing layer", () => {
    const offenders = walk(SRC).filter((file) => {
      if (/[\\/]printing[\\/]/.test(file)) return false;
      const text = readFileSync(file, "utf8");
      return /from ["']@\/lib\/printing\/escPosBytes["']/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
