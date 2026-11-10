import { describe, expect, it } from "vitest";
import { KdsTicket } from "@/core/domain/entities/Cashier";
import {
  PrintTemplateSettings,
  defaultPrintTemplateSettings,
} from "@/core/domain/entities/PrintTemplate";
import {
  KitchenSlip,
  SlipPreviewRow,
  buildKitchenSlipLines,
  formatKdsTicket,
  formatKitchenSlip,
  kdsTicketPlace,
  kdsTicketSender,
  kitchenSlipPreview,
} from "../formatKdsTicket";

type TextRow = Extract<SlipPreviewRow, { kind: "text" }>;

/** The rows a kitchen slip draws as text, as the printer would print them. */
const textRows = (slip: KitchenSlip): TextRow[] =>
  kitchenSlipPreview(slip).rows.filter((row): row is TextRow => row.kind === "text");

const sizeOf = (slip: KitchenSlip, text: string) =>
  textRows(slip).find((row) => row.text.includes(text))?.size;

const ticket = (fields: Partial<KdsTicket>): KdsTicket =>
  ({
    id: "ticket-1",
    ticketNumber: "KDS-0012",
    salesOrderId: "order-1",
    status: "PENDING",
    lines: [{ name: "Fried rice", quantity: "1" }],
    ...fields,
  }) as KdsTicket;

describe("the kitchen slip", () => {
  it("prints a ticket's items at the size its template asks for", () => {
    const items = [{ name: "Beer", quantity: "2" }];
    const itemMode = (slip: string) => {
      const index = slip.indexOf("2 x BEER");
      // The size travels on GS ! (0x1d 0x21); ESC ! only carries bold.
      const escape = slip.lastIndexOf("\u001d!", index);
      return slip.charCodeAt(escape + 2);
    };

    // No template: the ticket prints like the bill rather than at the kitchen's
    // old double height, so the Print Template screen's Normal is what comes out.
    expect(itemMode(formatKitchenSlip({ title: "0012", lines: items }))).toBe(0);
    expect(itemMode(formatKitchenSlip({ title: "0012", room: true, lines: items }))).toBe(0);

    // Big is still big, on a counter ticket and on a room's.
    const template = defaultPrintTemplateSettings();
    template.item.itemTextScale = "2H2W";
    expect(itemMode(formatKitchenSlip({ title: "0012", lines: items, template }))).toBe(0x11);
    expect(
      itemMode(formatKitchenSlip({ title: "0012", room: true, lines: items, template }))
    ).toBe(0x11);
  });

  it("says which room or table the food goes to", () => {
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "SPA_ROOM", number: "S1", name: null, guestCount: 2 } })
      )
    ).toBe("SPA S1");
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "KTV_ROOM", number: "K3", name: null, guestCount: null } })
      )
    ).toBe("KTV K3");
    expect(
      kdsTicketPlace(
        ticket({ place: { kind: "TABLE", number: "T12", name: null, guestCount: 4 } })
      )
    ).toBe("Table T12");
    expect(
      kdsTicketPlace(
        ticket({
          pickupNumber: "A12",
          place: { kind: "COUNTER", number: null, name: null, guestCount: null },
        })
      )
    ).toBe("Pickup A12");
  });

  it("names a KTV room after the tenant when the company is loaded", () => {
    const ktvRoom = ticket({
      place: { kind: "KTV_ROOM", number: "101", name: null, guestCount: null },
    });
    expect(kdsTicketPlace(ktvRoom, "Golden Club")).toBe("Golden Club 101");
    // Until the company loads, the slip still says where the food goes.
    expect(kdsTicketPlace(ktvRoom)).toBe("KTV 101");
    expect(kdsTicketPlace(ktvRoom, "   ")).toBe("KTV 101");
  });

  it("says who sent it", () => {
    expect(
      kdsTicketSender(
        ticket({ sentFrom: "STAFF", sentBy: { name: "Aung Aung", loginId: "SHW0001" } })
      )
    ).toBe("Aung Aung (ID: SHW0001)");
    expect(kdsTicketSender(ticket({ sentFrom: "TABLET", deviceName: "K3 tablet" }))).toBe(
      "K3 tablet"
    );
  });

  it("prints the room, the sender and the order number", () => {
    const text = formatKdsTicket(
      ticket({
        orderNumber: "SO-0012",
        place: { kind: "KTV_ROOM", number: "K3", name: null, guestCount: null },
        sentFrom: "STAFF",
        sentBy: { name: "Aung Aung", loginId: "SHW0001" },
      })
    );
    expect(text).toContain("KTV K3");
    expect(text).toContain("Sent by Aung Aung (ID: SHW0001)");
    expect(text).toContain("Order SO-0012");
    expect(text).toContain("1 x FRIED RICE");
  });

  it("heads a delete slip with DELETE and marks the removed item", () => {
    const text = formatKitchenSlip({
      title: "DELETE",
      stationName: "Bar",
      place: "Table T4",
      lines: [{ name: "Coffee", quantity: "1", remarks: "DELETE" }],
    });

    expect(text).toContain("BAR");
    expect(text).toContain("#DELETE");
    expect(text).toContain("1 x COFFEE");
    expect(text).toContain("** DELETE **");
  });

  it("obeys the Kitchen template Modifiers switch", () => {
    const settings = defaultPrintTemplateSettings();
    const slip = {
      title: "KDS-0012",
      lines: [
        {
          name: "Coffee",
          quantity: "1",
          modifiers: "Oat milk",
          modifierPrices: "1.5000",
        },
      ],
    };

    settings.item.modifiers = false;
    expect(formatKitchenSlip({ ...slip, template: settings })).not.toContain(
      "+ Oat milk"
    );

    settings.item.modifiers = true;
    expect(formatKitchenSlip({ ...slip, template: settings })).toContain(
      "+ Oat milk"
    );
  });
});

describe("the kitchen slip's text size switches", () => {
  const slip = (template?: ReturnType<typeof defaultPrintTemplateSettings>) => ({
    title: "KDS-0012",
    place: "KTV K3",
    lines: [{ name: "Beer", quantity: "2" }],
    ...(template ? { template } : {}),
  });

  it("prints the place at the Other text size the template asks for", () => {
    const settings = defaultPrintTemplateSettings();
    expect(sizeOf(slip(settings), "KTV K3")).toBe("normal");

    settings.item.otherTextScale = "2H2W";
    expect(sizeOf(slip(settings), "KTV K3")).toBe("huge");

    // A slip with no template prints the place like the rest of the ticket.
    expect(sizeOf(slip(), "KTV K3")).toBe("normal");
  });

  it("prints a room ticket's items at the Item text size the switch names", () => {
    const settings = defaultPrintTemplateSettings();
    // The settings screen leaves the old font size at the kitchen's large once
    // the switch is used; the switch is what the ticket must print.
    settings.item.itemTextScale = "1H1W";
    settings.item.fontSize = "LARGE";
    const room = { ...slip(settings), room: true };

    expect(sizeOf(room, "2 x BEER")).toBe("normal");

    settings.item.itemTextScale = "2H1W";
    expect(sizeOf(room, "2 x BEER")).toBe("tall");

    settings.item.itemTextScale = "1H2W";
    expect(sizeOf(room, "2 x BEER")).toBe("wide");
  });

  it("prints a counter ticket's items at the Item text size the switch names", () => {
    const settings = defaultPrintTemplateSettings();
    expect(sizeOf(slip(settings), "2 x BEER")).toBe("normal");

    // The settings screen leaves the old font size at the kitchen's large, so
    // Big still prints as the switch asks.
    Object.assign(settings.item, { itemTextScale: "2H2W", fontSize: "LARGE" });
    expect(sizeOf(slip(settings), "2 x BEER")).toBe("huge");

    settings.item.itemTextScale = "2H1W";
    expect(sizeOf(slip(settings), "2 x BEER")).toBe("tall");
  });

  it("sends the item size as GS ! so every printer magnifies the same", () => {
    const settings = defaultPrintTemplateSettings();
    settings.item.itemTextScale = "1H1W";
    settings.item.fontSize = "LARGE";
    const line = (scale: string) => {
      settings.item.itemTextScale = scale;
      return formatKitchenSlip({
        title: "KDS-1",
        lines: [{ name: "Beef", quantity: "1" }],
        template: settings,
      });
    };

    // ESC ! carries bold only; the size is the GS ! parameter, which also
    // overrides a magnification a printer was left configured with.
    expect(line("1H1W")).toContain("\x1b!\x08\x1d!\x00");
    expect(line("2H1W")).toContain("\x1b!\x08\x1d!\x10");
    expect(line("1H2W")).toContain("\x1b!\x08\x1d!\x01");
    expect(line("2H2W")).toContain("\x1b!\x08\x1d!\x11");
  });
});

describe("the kitchen ticket's switches", () => {
  /** A ticket printed with one switch moved, and everything else as it ships. */
  const slipWith = (
    move: (settings: PrintTemplateSettings) => void,
    extra: Partial<KitchenSlip> = {}
  ) => {
    const settings = defaultPrintTemplateSettings();
    move(settings);
    return {
      title: "KDS-1",
      stationName: "Bar",
      lines: [{ name: "Beer", quantity: "2", remarks: "No ice" }],
      sentBy: "Aung",
      template: settings,
      ...extra,
    } as KitchenSlip;
  };
  const printed = (slip: KitchenSlip) => buildKitchenSlipLines(slip).join("\n");

  it("prints the name first when quantity-first is off", () => {
    expect(printed(slipWith((settings) => { settings.item.qtyFirst = false; }))).toContain(
      "BEER x2"
    );
    expect(printed(slipWith((settings) => { settings.item.qtyFirst = true; }))).toContain(
      "2 x BEER"
    );
  });

  it("leaves an item's remark off when product remarks are off", () => {
    expect(
      printed(slipWith((settings) => { settings.item.productRemarks = false; }))
    ).not.toContain("No ice");
    expect(printed(slipWith(() => undefined))).toContain("No ice");
  });

  it("leaves the sender off when the cashier switch is off", () => {
    expect(
      printed(slipWith((settings) => { settings.other.cashier = false; }))
    ).not.toContain("Sent by Aung");
    expect(printed(slipWith(() => undefined))).toContain("Sent by Aung");
  });

  it("prints the footer at the Other text size", () => {
    const settings = defaultPrintTemplateSettings();
    settings.other.footerText = "Kitchen copy";
    settings.item.otherTextScale = "2H2W";
    const rows = kitchenSlipPreview({ title: "KDS-1", lines: [], template: settings }).rows;
    const footer = rows.find(
      (row): row is TextRow => row.kind === "text" && row.text.includes("Kitchen copy")
    );

    expect(footer?.size).toBe("huge");
  });

  it("keeps the switches on a ticket with no template", () => {
    const text = printed({ title: "KDS-1", lines: [{ name: "Beer", quantity: "2" }] });

    expect(text).toContain("2 x BEER");
    expect(text).toContain("2 items");
  });
});
