import { describe, expect, it } from "vitest";
import { KdsTicket, KdsTicketLine } from "@/core/domain/entities/Cashier";
import { kdsTicketPrintLines } from "../formatKdsTicket";

describe("kdsTicketPrintLines", () => {
  it("prints the lady who ordered a line after its options", () => {
    const ticket = new KdsTicket({
      lines: [
        { name: "Fried rice", quantity: "1", modifiers: "Less spicy", orderedBy: "Snow" },
        { name: "Soda", quantity: "1", orderedBy: "Lily" },
        { name: "Water", quantity: "2" },
      ],
    });

    expect(kdsTicketPrintLines(ticket).map((line) => line.modifiers)).toEqual([
      "Less spicy, Snow",
      "Lily",
      undefined,
    ]);
  });

  it("names her on a ticket read from its saved lines", () => {
    const ticket = new KdsTicket({
      kdsTicketLines: [
        new KdsTicketLine({ productName: "Fried rice", quantity: "1", orderedBy: "Snow" }),
      ],
    });

    expect(kdsTicketPrintLines(ticket)[0].modifiers).toBe("Snow");
  });
});
