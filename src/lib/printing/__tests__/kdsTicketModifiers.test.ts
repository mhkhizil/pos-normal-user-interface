import { describe, expect, it } from "vitest";
import {
  KdsTicket,
  KdsTicketLine,
  SalesOrderLine,
} from "@/core/domain/entities/Cashier";
import { formatKdsTicket } from "../formatKdsTicket";
import { applyKdsTicketHostess, applyKdsTicketModifiers } from "../kdsTicketModifiers";

const ticket = () =>
  new KdsTicket({
    id: "ticket-1",
    ticketNumber: "KDS-001",
    salesOrderId: "order-1",
    status: "PENDING",
    kdsTicketLines: [
      new KdsTicketLine({
        id: "ticket-line-1",
        salesOrderLineId: "line-1",
        productName: "Coffee",
        quantity: "1",
        status: "PENDING",
      }),
    ],
    lines: [{ name: "Coffee", quantity: "1", categoryId: "cat-drinks" }],
  });

const orderLine = () =>
  new SalesOrderLine({
    id: "line-1",
    salesOrderId: "order-1",
    selectedModifiers: [
      { modifierId: "mod-1", name: "Oat milk", priceDelta: "1.5000" },
    ],
  });

describe("KDS ticket modifiers", () => {
  it("fills a ticket line from its order line modifiers", () => {
    const enriched = applyKdsTicketModifiers(ticket(), [orderLine()]);

    expect(enriched.kdsTicketLines?.[0].kitchenModifiers).toBe("Oat milk");
    expect(enriched.kdsTicketLines?.[0].modifierPrices).toBe("1.5000");
    expect(enriched.lines?.[0].modifiers).toBe("Oat milk");
    expect(enriched.lines?.[0].modifierPrices).toBe("1.5000");
    expect(enriched.lines?.[0].categoryId).toBe("cat-drinks");
    expect(formatKdsTicket(enriched)).toContain("+ Oat milk");
  });

  it("keeps modifiers the ticket already has", () => {
    const current = ticket();
    current.kdsTicketLines![0].kitchenModifiers = "No sugar";

    expect(applyKdsTicketModifiers(current, [orderLine()])).toBe(current);
  });

  it("leaves a ticket alone when its order line cannot be matched", () => {
    const current = ticket();
    const otherLine = new SalesOrderLine({
      id: "line-2",
      selectedModifiers: [{ name: "Oat milk" }],
    });

    expect(applyKdsTicketModifiers(current, [otherLine])).toBe(current);
  });
});

describe("KDS ticket lady name", () => {
  const names: Record<string, string> = { "hostess-1": "Snow" };

  it("names the lady who ordered a line, after its options", () => {
    const current = ticket();
    current.lines![0].modifiers = "No sugar";
    const order = new SalesOrderLine({ id: "line-1", hostessId: "hostess-1" });

    const named = applyKdsTicketHostess(current, [order], (id) => names[id]);

    expect(named.kdsTicketLines?.[0].orderedBy).toBe("Snow");
    expect(named.lines?.[0].orderedBy).toBe("Snow");
    // Each option prints on its own "+" row, the lady after the options.
    const printed = formatKdsTicket(named);
    expect(printed).toContain("+ No sugar");
    expect(printed).toContain("+ Snow");
  });

  it("keeps the lady the ticket already carries", () => {
    const current = ticket();
    current.kdsTicketLines![0].orderedBy = "Lily";
    const order = new SalesOrderLine({ id: "line-1", hostessId: "hostess-1" });

    expect(applyKdsTicketHostess(current, [order], (id) => names[id])).toBe(current);
  });

  it("leaves a line with no lady alone", () => {
    const current = ticket();
    const order = new SalesOrderLine({ id: "line-1" });

    expect(applyKdsTicketHostess(current, [order], (id) => names[id])).toBe(current);
  });
});
