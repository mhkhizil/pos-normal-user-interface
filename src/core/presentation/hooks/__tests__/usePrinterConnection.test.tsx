import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { KitchenPrintPlan } from "@/lib/printing/routeKitchenPrint";
import { savePrinterBinding } from "@/lib/pos/printerBindingStorage";
import { defaultPrintTemplateSettings, PrintTemplate } from "@/core/domain/entities/PrintTemplate";
import {
  KdsStation,
  KdsTicket,
  KdsTicketLine,
  SalesOrderLine,
} from "@/core/domain/entities/Cashier";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  printKitchen: vi.fn(),
  printReceipt: vi.fn(),
  resolveTemplate: vi.fn(),
  listTemplates: vi.fn(),
  getSalesOrderLines: vi.fn(),
  company: vi.fn(),
  listPrinters: vi.fn(),
  listStations: vi.fn(),
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
      if (key === "salesOrderService") {
        return { getSalesOrderLines: mocks.getSalesOrderLines };
      }
      if (key === "printTemplateService") {
        return {
          list: mocks.listTemplates,
          resolve: mocks.resolveTemplate,
          company: mocks.company,
        };
      }
      if (key === "kitchenPrinterService") {
        return { list: mocks.listPrinters };
      }
      if (key === "kdsStationService") {
        return { list: mocks.listStations };
      }
      return {
        list: vi.fn().mockResolvedValue({ printers: [] }),
        resolve: mocks.resolveTemplate,
        company: mocks.company,
        get: vi.fn().mockResolvedValue({ currency: "MMK" }),
      };
    },
  },
}));

import { usePrinterConnection } from "../usePrinterConnection";

const tenantId = "tenant-1";
const registerId = "register-1";

/** Only "salad" is routed to the drink-station printer. */
const drinkStation = {
  id: "station-drink",
  name: "KDS Drink",
  printerIds: ["printer-drink"],
  categoryIds: ["salad"],
};

const renderConnection = () =>
  renderHook(() => usePrinterConnection(tenantId, registerId));

// The company is cached per tenant for the life of the module; keep the default empty.
beforeEach(() => {
  mocks.company.mockReset();
  mocks.company.mockResolvedValue({ name: "" });
  mocks.listTemplates.mockReset();
  mocks.listTemplates.mockResolvedValue({ templates: [] });
  mocks.listPrinters.mockReset();
  mocks.listPrinters.mockResolvedValue({ printers: [] });
  mocks.listStations.mockReset();
  mocks.listStations.mockResolvedValue({ stations: [] });
});

describe("usePrinterConnection print templates", () => {
  const bindKds = () =>
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id: "backend:printer-kds",
        backendPrinterId: "printer-kds",
        transport: "NETWORK",
        displayName: "KDS printer",
        sectors: ["KDS"],
        lastVerifiedAt: "",
      },
      true
    );

  const kitchenTemplate = (settings = defaultPrintTemplateSettings()) =>
    new PrintTemplate({
      id: "kitchen-1",
      type: "KITCHEN",
      name: "KDS",
      isDefault: true,
      locationId: "location-1",
      paperWidth: "MM80",
      settings,
    });

  beforeEach(() => {
    localStorage.clear();
    mocks.resolveTemplate.mockReset();
    mocks.printKitchen.mockReset();
    mocks.printKitchen.mockResolvedValue(undefined);
    mocks.getSalesOrderLines.mockReset();
    mocks.getSalesOrderLines.mockResolvedValue({ lines: [] });
    bindKds();
  });

  it("prints at the sizes the outlet saved when the server offers only its built-in layout", async () => {
    // The server's built-in layout prints big; the shop's own template is Normal.
    const builtIn = defaultPrintTemplateSettings();
    builtIn.item.itemTextScale = "2H2W";
    builtIn.item.otherTextScale = "2H2W";
    mocks.resolveTemplate.mockResolvedValue({ source: "BUILTIN", settings: builtIn });
    mocks.listTemplates.mockResolvedValue({ templates: [kitchenTemplate()] });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await act(async () => {
      await result.current.printKitchen({
        title: "KITCHEN",
        lines: [{ name: "Coffee", quantity: "1" }],
      });
    });

    const [, slip] = mocks.printKitchen.mock.calls[0];
    expect(slip.template).toMatchObject({
      item: { itemTextScale: "1H1W", otherTextScale: "1H1W" },
    });
  });

  it("keeps the server's own template when it is a saved one", async () => {
    const own = defaultPrintTemplateSettings();
    own.item.itemTextScale = "2H1W";
    mocks.resolveTemplate.mockResolvedValue({ source: "LOCATION", settings: own });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await act(async () => {
      await result.current.printKitchen({
        title: "KITCHEN",
        lines: [{ name: "Coffee", quantity: "1" }],
      });
    });

    const [, slip] = mocks.printKitchen.mock.calls[0];
    expect(slip.template).toMatchObject({ item: { itemTextScale: "2H1W" } });
    expect(mocks.listTemplates).not.toHaveBeenCalled();
  });

  it("falls back to the saved template when the server cannot resolve one", async () => {
    mocks.resolveTemplate.mockRejectedValue(new Error("No print template"));
    mocks.listTemplates.mockResolvedValue({ templates: [kitchenTemplate()] });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await act(async () => {
      await result.current.printKitchen({
        title: "KITCHEN",
        lines: [{ name: "Coffee", quantity: "1" }],
      });
    });

    const [, slip] = mocks.printKitchen.mock.calls[0];
    expect(slip.template).toMatchObject({ item: { itemTextScale: "1H1W" } });
  });
});

describe("usePrinterConnection station routing", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.resolveTemplate.mockResolvedValue({ settings: undefined });
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue(undefined);
    mocks.printKitchen.mockReset();
    mocks.printKitchen.mockResolvedValue(undefined);
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id: "backend:printer-drink",
        backendPrinterId: "printer-drink",
        transport: "NETWORK",
        displayName: "Drink printer",
        sectors: ["KDS"],
        lastVerifiedAt: "",
      },
      true
    );
  });

  it("does not spray unrouted categories onto the station printer in strict mode", async () => {
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    let plan!: KitchenPrintPlan;
    await act(async () => {
      plan = await result.current.printKitchen(
        {
          title: "KITCHEN",
          lines: [
            { name: "Coffee", quantity: "1", categoryId: "drink" },
            { name: "Pasta", quantity: "1", categoryId: "main" },
          ],
        },
        [drinkStation],
        { requireStationRouting: true }
      );
    });

    expect(plan.jobs).toEqual([]);
    expect(plan.unrouted.map((line) => line.name)).toEqual(["Coffee", "Pasta"]);
    expect(mocks.printKitchen).not.toHaveBeenCalled();
  });

  it("prints only the routed category and leaves the rest unrouted", async () => {
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    let plan!: KitchenPrintPlan;
    await act(async () => {
      plan = await result.current.printKitchen(
        {
          title: "KITCHEN",
          lines: [
            { name: "Salad", quantity: "1", categoryId: "salad" },
            { name: "Coffee", quantity: "1", categoryId: "drink" },
          ],
        },
        [drinkStation],
        { requireStationRouting: true }
      );
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.unrouted.map((line) => line.name)).toEqual(["Coffee"]);
    expect(mocks.printKitchen).toHaveBeenCalledTimes(1);
    const [binding, slip] = mocks.printKitchen.mock.calls[0];
    expect(binding.backendPrinterId).toBe("printer-drink");
    expect(slip.lines.map((line: { name: string }) => line.name)).toEqual([
      "Salad",
    ]);
  });

  it("falls back to the KDS printer when strict routing is not required", async () => {
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printKitchen(
        {
          title: "KITCHEN",
          lines: [{ name: "Coffee", quantity: "1", categoryId: "drink" }],
        },
        [drinkStation]
      );
    });

    expect(mocks.printKitchen).toHaveBeenCalledTimes(1);
  });
});

describe("usePrinterConnection station routing", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.printKitchen.mockReset();
    mocks.printKitchen.mockResolvedValue(undefined);
  });

  /** A KDS printer bound on this till, as Settings saves one. */
  const bind = (id: string, backendPrinterId: string, host: string) =>
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id,
        backendPrinterId,
        transport: "NETWORK",
        displayName: id,
        host,
        port: 9100,
        sectors: ["KDS"],
        lastVerifiedAt: "",
      },
      false
    );

  it("reads the outlet's stations for a caller that has none to hand", async () => {
    // A room tablet's order arrives with no station list: the hook reads the
    // outlet's stations so each item still reaches the station of its category.
    bind("Chinese KDS", "printer-chinese", "10.4.0.1");
    bind("Beverage KDS", "printer-drinks", "10.4.0.2");
    mocks.listStations.mockResolvedValue({
      stations: [
        {
          id: "st-chinese",
          name: "Chinese KDS",
          printerIds: ["printer-chinese"],
          routingRules: { categoryIds: ["cat-chinese"] },
        },
        {
          id: "st-drinks",
          name: "Beverage KDS",
          printerIds: ["printer-drinks"],
          routingRules: { categoryIds: ["cat-drinks"] },
        },
      ],
    });

    const { result } = renderHook(() =>
      usePrinterConnection(tenantId, registerId, "location-1")
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printKitchen({
        title: "Room order 4",
        place: "Room S2",
        lines: [
          { name: "Chinese fried noodle", quantity: "1", categoryId: "cat-chinese" },
          { name: "Beer", quantity: "2", categoryId: "cat-drinks" },
        ],
      });
    });

    const printed = mocks.printKitchen.mock.calls.map(([binding, slip]) => [
      binding.displayName,
      slip.lines.map((line: { name: string }) => line.name),
    ]);
    expect(printed).toEqual([
      ["Chinese KDS", ["Chinese fried noodle"]],
      ["Beverage KDS", ["Beer"]],
    ]);
  });
});

describe("usePrinterConnection paid bill copies", () => {
  const bind = (id: string, sectors: ("CHECKOUT" | "FINANCE")[]) =>
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id,
        transport: "NETWORK",
        displayName: id,
        host: "10.0.0.1",
        port: 9100,
        sectors,
        lastVerifiedAt: "",
      },
      false
    );

  const printed = () =>
    mocks.printReceipt.mock.calls.map(([binding, slip]) => [
      binding.displayName,
      slip.title,
      slip.place,
    ]);

  const sale = { title: "RECEIPT", sale: true, lines: [], total: "1000" };

  beforeEach(() => {
    localStorage.clear();
    mocks.printReceipt.mockReset();
    mocks.printReceipt.mockResolvedValue(undefined);
    bind("Till", ["CHECKOUT"]);
  });

  const withCopies = (copies: string[]) => {
    const settings = defaultPrintTemplateSettings();
    settings.copies = copies;
    mocks.resolveTemplate.mockResolvedValue({ settings, paperWidth: "MM80" });
  };

  it("prints the copies the template asks for, the guest's first", async () => {
    withCopies(["FINANCE", "ORDER_RECEIPT", "CUSTOMER"]);
    bind("Office", ["FINANCE"]);
    const { result } = renderConnection();
    await act(async () => {
      await result.current.printReceipt(sale);
    });
    expect(printed()).toEqual([
      ["Till", "RECEIPT", "CHECKOUT"],
      ["Till", "Order receipt", "CHECKOUT"],
      ["Office", "Finance copy", "FINANCE"],
    ]);
  });

  it("sends the finance copy to the till when there is no finance printer", async () => {
    withCopies(["CUSTOMER", "FINANCE"]);
    const { result } = renderConnection();
    await act(async () => {
      await result.current.printReceipt(sale);
    });
    expect(printed()).toEqual([
      ["Till", "RECEIPT", "CHECKOUT"],
      ["Till", "Finance copy", "FINANCE"],
    ]);
  });

  it("prints one slip for anything that is not a paid bill", async () => {
    withCopies(["CUSTOMER", "ORDER_RECEIPT"]);
    const { result } = renderConnection();
    await act(async () => {
      await result.current.printReceipt({ ...sale, sale: undefined, title: "Top-up" });
    });
    expect(printed()).toEqual([["Till", "Top-up", "CHECKOUT"]]);
  });

  it("prints a customer bill once when the same printer has two bindings", async () => {
    bind("Till duplicate", ["CHECKOUT"]);
    const { result } = renderConnection();
    await act(async () => {
      await result.current.printReceipt({
        title: "Customer bill",
        lines: [],
        total: "1000",
      });
    });

    expect(printed()).toEqual([["Till", "Customer bill", "CHECKOUT"]]);
  });
});

describe("usePrinterConnection KDS ticket modifiers", () => {
  const station = {
    id: "station-hot",
    name: "Hot line",
    printerIds: ["printer-hot"],
    categoryIds: [] as string[],
  };

  beforeEach(() => {
    localStorage.clear();
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue(undefined);
    mocks.resolveTemplate.mockResolvedValue({ settings: undefined });
    mocks.printKitchen.mockReset();
    mocks.printKitchen.mockResolvedValue(undefined);
    mocks.getSalesOrderLines.mockReset();
    mocks.getSalesOrderLines.mockResolvedValue({ lines: [] });
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id: "backend:printer-hot",
        backendPrinterId: "printer-hot",
        transport: "NETWORK",
        displayName: "Hot printer",
        sectors: ["KDS"],
        lastVerifiedAt: "",
      },
      true
    );
  });

  it("fills a ticket's missing modifiers from its order line", async () => {
    mocks.getSalesOrderLines.mockResolvedValue({
      lines: [
        new SalesOrderLine({
          id: "line-1",
          salesOrderId: "order-1",
          selectedModifiers: [
            { modifierId: "mod-1", name: "Oat milk", priceDelta: "1.5000" },
          ],
        }),
      ],
    });
    const ticket = new KdsTicket({
      id: "ticket-1",
      ticketNumber: "KDS-001",
      salesOrderId: "order-1",
      stationId: "station-hot",
      status: "PENDING",
      station: new KdsStation({
        id: "station-hot",
        name: "Hot line",
        printerIds: ["printer-hot"],
      }),
      kdsTicketLines: [
        new KdsTicketLine({
          id: "ticket-line-1",
          salesOrderLineId: "line-1",
          productName: "Coffee",
          quantity: "1",
          status: "PENDING",
        }),
      ],
      lines: [{ name: "Coffee", quantity: "1" }],
    });
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printTicket(ticket, [station]);
    });

    expect(mocks.getSalesOrderLines).toHaveBeenCalledWith("order-1", {
      page: 1,
      limit: 100,
    });
    const [, slip] = mocks.printKitchen.mock.calls[0];
    expect(slip.lines).toEqual([
      expect.objectContaining({
        name: "Coffee",
        modifiers: "Oat milk",
        modifierPrices: "1.5000",
      }),
    ]);
  });
});

describe("usePrinterConnection KTV slips", () => {
  // A tenant of its own, so the cached company of the other suites does not leak in.
  const ktvTenant = "tenant-ktv";

  beforeEach(() => {
    localStorage.clear();
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue(undefined);
    mocks.resolveTemplate.mockResolvedValue({ settings: undefined });
    mocks.printKitchen.mockReset();
    mocks.printKitchen.mockResolvedValue(undefined);
    mocks.getSalesOrderLines.mockReset();
    mocks.getSalesOrderLines.mockResolvedValue({ lines: [] });
    mocks.company.mockReset();
    mocks.company.mockResolvedValue({ name: "Golden Club" });
    savePrinterBinding(
      ktvTenant,
      registerId,
      {
        id: "backend:printer-kds",
        backendPrinterId: "printer-kds",
        transport: "NETWORK",
        displayName: "KDS printer",
        sectors: ["KDS"],
        lastVerifiedAt: "",
      },
      true
    );
  });

  it("prints the room under the tenant's name instead of a fixed brand", async () => {
    const { result } = renderHook(() =>
      usePrinterConnection(ktvTenant, registerId)
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    const ticket = new KdsTicket({
      id: "ticket-ktv",
      ticketNumber: "KDS-0021",
      salesOrderId: "order-2",
      status: "PENDING",
      place: { kind: "KTV_ROOM", number: "101", name: null, guestCount: 2 },
      lines: [{ name: "Beer", quantity: "2" }],
    });

    await act(async () => {
      await result.current.printTicket(ticket);
    });

    const [, slip] = mocks.printKitchen.mock.calls[0];
    expect(slip.place).toBe("Golden Club 101");
  });
});

describe("usePrinterConnection print sectors from the back office", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue(undefined);
    mocks.resolveTemplate.mockResolvedValue({ settings: undefined });
    mocks.printReceipt.mockReset();
    mocks.printReceipt.mockResolvedValue(undefined);
    mocks.printKitchen.mockReset();
    mocks.printKitchen.mockResolvedValue(undefined);
  });

  /** The bar printer bound on this till, and ticked as its default. */
  const bindBar = (sectors?: Array<"KDS" | "CHECKOUT" | "FINANCE">) =>
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id: "printer-bar",
        backendPrinterId: "printer-bar",
        transport: "NETWORK",
        displayName: "Bar",
        host: "192.168.201.92",
        port: 9100,
        ...(sectors ? { sectors } : {}),
        lastVerifiedAt: "",
      },
      true
    );

  /** What the back office says about that printer: kitchen tickets only. */
  const backendSaysKds = () =>
    mocks.listPrinters.mockResolvedValue({
      printers: [
        {
          id: "printer-bar",
          name: "Bar",
          port: 9100,
          ipAddress: "192.168.201.92",
          sectors: ["KDS"],
          isActive: true,
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    });

  const paidBill = { title: "RECEIPT", sale: true, lines: [], total: "1000" };

  it("keeps a KDS printer to kitchen tickets when its binding names no sectors", async () => {
    // A binding saved before print sectors existed carries none of its own.
    bindBar();
    backendSaysKds();
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await expect(result.current.printReceipt(paidBill)).rejects.toThrow(
        /checkout printer/
      );
      await expect(
        result.current.printReceipt({ ...paidBill, title: "Finance copy", place: "FINANCE" })
      ).rejects.toThrow(/finance printer/);
    });

    expect(mocks.printReceipt).not.toHaveBeenCalled();
  });

  it("keeps a KDS printer to kitchen tickets when its binding still names the till's sections", async () => {
    // A binding written when this printer was the till's counter printer.
    bindBar(["CHECKOUT", "FINANCE"]);
    backendSaysKds();
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await expect(result.current.printReceipt(paidBill)).rejects.toThrow(
        /checkout printer/
      );
    });

    expect(mocks.printReceipt).not.toHaveBeenCalled();
  });

  it("still prints kitchen tickets on that printer", async () => {
    bindBar();
    backendSaysKds();
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printKitchen({
        title: "KITCHEN",
        lines: [{ name: "Beer", quantity: "1" }],
      });
    });

    expect(mocks.printKitchen).toHaveBeenCalledTimes(1);
    const [binding] = mocks.printKitchen.mock.calls[0];
    expect(binding.displayName).toBe("Bar");
  });
});

describe("usePrinterConnection print areas", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue(undefined);
    mocks.resolveTemplate.mockResolvedValue({ settings: undefined });
    mocks.printReceipt.mockReset();
    mocks.printReceipt.mockResolvedValue(undefined);
  });

  const bind = (
    id: string,
    displayName: string,
    host: string,
    printsFor?: Array<"BAR" | "KTV" | "SPA">
  ) =>
    savePrinterBinding(
      tenantId,
      registerId,
      {
        id,
        backendPrinterId: id,
        transport: "NETWORK",
        displayName,
        host,
        port: 9100,
        sectors: ["CHECKOUT"],
        ...(printsFor ? { printsFor } : {}),
        lastVerifiedAt: "",
      },
      id === "printer-bar"
    );

  const printed = () =>
    mocks.printReceipt.mock.calls.map(
      ([binding]) => (binding as { displayName: string }).displayName
    );

  it("prints a KTV guest slip on the KTV counter only", async () => {
    bind("printer-bar", "Cashier", "192.168.1.51", ["BAR"]);
    bind("printer-ktv", "KTV counter", "192.168.1.50", ["KTV"]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printReceipt({
        title: "RECEIPT",
        sale: true,
        area: "KTV",
        lines: [],
        total: "1000",
      });
    });

    expect(printed()).toEqual(["KTV counter"]);
  });

  it("prints a bar guest slip on the bar counter only", async () => {
    bind("printer-bar", "Cashier", "192.168.1.51", ["BAR"]);
    bind("printer-ktv", "KTV counter", "192.168.1.50", ["KTV"]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printReceipt({
        title: "RECEIPT",
        sale: true,
        area: "BAR",
        lines: [],
        total: "1000",
      });
    });

    expect(printed()).toEqual(["Cashier"]);
  });

  it("prints on a printer that lists no area when the area's own is not set up", async () => {
    bind("printer-plain", "Counter", "192.168.1.52");
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.printReceipt({
        title: "RECEIPT",
        sale: true,
        area: "SPA",
        lines: [],
        total: "1000",
      });
    });

    expect(printed()).toEqual(["Counter"]);
  });
});


