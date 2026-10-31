import { describe, expect, it } from "vitest";
import { KdsTicket } from "@/core/domain/entities/Cashier";
import { defaultPrintTemplateSettings } from "@/core/domain/entities/PrintTemplate";
import {
  formatKdsTicket,
  formatKitchenSlip,
  kdsTicketPlace,
  kdsTicketSender,
} from "../formatKdsTicket";

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
  it("spaces a room ticket's items like the bill, not the kitchen", () => {
    const items = [{ name: "Beer", quantity: "2" }];
    const itemMode = (slip: string) => {
      const index = slip.indexOf("2 x BEER");
      const escape = slip.lastIndexOf("\u001b!", index);
      return slip.charCodeAt(escape + 2);
    };

    // 0x10 is the printer's double-height bit: the gap between items grows with
    // it, so a room ticket prints at the checkout bill's normal line height.
    expect(itemMode(formatKitchenSlip({ title: "0012", lines: items })) & 0x10).toBe(
      0x10
    );
    expect(
      itemMode(formatKitchenSlip({ title: "0012", room: true, lines: items })) & 0x10
    ).toBe(0);
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
