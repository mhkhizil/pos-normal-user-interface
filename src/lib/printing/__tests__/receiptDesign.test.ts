import { describe, expect, it } from "vitest";
import { KdsTicket } from "@/core/domain/entities/Cashier";
import { cardSlip } from "../cardSlip";
import {
  buildKitchenSlipLines,
  buildSaleReceiptLines,
  formatKitchenSlip,
  formatSaleReceipt,
  kdsTicketPlaceDetail,
  printAmount,
  printMoney,
  wrapText,
} from "../formatKdsTicket";

const company = {
  name: "Grand Spa",
  legalName: "Grand Spa Co., Ltd.",
  address: "No. 12, Pyay Road, Yangon",
  phone: "09 123 456 789",
};

describe("receipt design", () => {
  it("writes money with thousands and no trailing zeros", () => {
    expect(printMoney("50350.0000")).toBe("50,350");
    expect(printMoney("12.5")).toBe("12.50");
    expect(printMoney("")).toBe("");
  });

  it("writes amounts the way the business charges", () => {
    expect(printAmount("100000.0000", "MMK")).toBe("100,000");
    expect(printAmount("100000", "USD")).toBe("$ 100,000");
    expect(printAmount("12.5", "USD")).toBe("$ 12.50");
    expect(printAmount(-2825, "MMK")).toBe("-2,825");
    expect(printAmount(-2825, "USD")).toBe("-$ 2,825");
    expect(printAmount("100000")).toBe("100,000");
  });

  it("prints the totals, payments and change, tagging only dollars", () => {
    const receipt = {
      title: "Receipt",
      lines: [{ name: "Beer", quantity: "2", unitPrice: "3000" }],
      subtotal: "6000",
      discount: "500",
      total: "5500",
      payments: [{ name: "Cash", amount: "10000" }],
      change: "4500",
    };
    const kyat = buildSaleReceiptLines({ ...receipt, currency: "MMK" }).join("\n");
    expect(kyat).toMatch(/2 x Beer\s+6,000\n/);
    // Kyat needs no currency tag on the slip.
    expect(kyat).not.toContain("MMK");
    expect(kyat).toMatch(/Subtotal\s+6,000/);
    expect(kyat).toMatch(/Discount\s+-500/);
    expect(kyat).toMatch(/TOTAL\s+5,500/);
    expect(kyat).toMatch(/Cash\s+10,000/);
    expect(kyat).toMatch(/Change\s+4,500/);
    const dollars = buildSaleReceiptLines({ ...receipt, currency: "USD" }).join("\n");
    expect(dollars).toMatch(/TOTAL\s+\$ 5,500/);
    expect(dollars).toMatch(/Discount\s+-\$ 500/);
  });

  it("shows a promotion under its item, in two decimals", () => {
    const text = buildSaleReceiptLines({
      title: "Receipt",
      lines: [
        {
          name: "Beer",
          quantity: "2",
          unitPrice: "10000",
          promotion: "1+1",
          promotionAmount: "10000.0000",
        },
      ],
      subtotal: "10000.0000",
      discount: "1500.5000",
      total: "8499.5000",
      currency: "MMK",
    }).join("\n");
    // The 1+1 prints under the item it belongs to, not in the totals.
    expect(text).toMatch(/2 @ 10,000[\s\S]*?1\+1\s+-10,000/);
    expect(text).toMatch(/Subtotal\s+10,000/);
    expect(text).toMatch(/Discount\s+-1,500\.50/);
    // Money never prints the API's four decimals.
    expect(text).not.toMatch(/\.0000/);
    expect(text).not.toMatch(/\d\.\d{3,}/);
  });

  it("leaves the promotion line out when nothing was promoted", () => {
    const text = buildSaleReceiptLines({
      title: "Receipt",
      lines: [{ name: "Beer", quantity: "1", unitPrice: "10000" }],
      subtotal: "10000",
      total: "10000",
    }).join("\n");
    expect(text).not.toContain("Promotion");
    expect(text).not.toContain("1+1");
  });

  it("wraps long words and lines to the paper", () => {
    expect(wrapText("Fried rice with chicken", 10)).toEqual(["Fried rice", "with", "chicken"]);
    expect(wrapText("ABCDEFGHIJKL", 5)).toEqual(["ABCDE", "FGHIJ", "KL"]);
  });

  it("heads a customer's receipt with the company", () => {
    const rows = buildSaleReceiptLines({
      title: "Receipt",
      company,
      lines: [{ name: "Beer", quantity: "2", unitPrice: "3000" }],
      total: "6000",
      payments: [{ name: "Cash", amount: "10000" }],
      change: "4000",
    });
    const text = rows.join("\n");
    expect(rows[0].trim()).toBe("GRAND SPA");
    expect(text).toContain("Grand Spa Co., Ltd.");
    expect(text).toContain("No. 12, Pyay Road, Yangon");
    expect(text).toContain("Tel 09 123 456 789");
    expect(text).toMatch(/2 x Beer\s+6,000/);
    expect(text).toContain("2 @ 3,000");
    expect(text).toMatch(/TOTAL\s+6,000/);
    expect(text).toMatch(/Change\s+4,000/);
    expect(text).toContain("Thank you!");
    expect(rows.every((row) => row.length <= 32)).toBe(true);
  });

  it("prints the company name wide and bold on the printer", () => {
    const printed = formatSaleReceipt({ title: "Receipt", company, lines: [], total: "0" });
    expect(printed).toContain("\x1b!\x28GRAND SPA");
  });

  it("keeps the company off the staff finance slip", () => {
    const text = buildSaleReceiptLines({
      title: "Finance",
      place: "FINANCE",
      company,
      lines: [],
      total: "0",
    }).join("\n");
    expect(text).not.toContain("GRAND SPA");
    expect(text).not.toContain("Thank you!");
  });

  it("uses the full width of 80mm paper", () => {
    const rows = buildSaleReceiptLines({
      title: "Receipt",
      paperWidth: "MM80",
      lines: [{ name: "Beer", quantity: "1", unitPrice: "3000" }],
      total: "3000",
    });
    expect(rows.find((row) => row.startsWith("1 x Beer"))).toHaveLength(48);
  });

  it("prints a card top-up with the card, how it was paid and the new balance", () => {
    const text = buildSaleReceiptLines(
      cardSlip(
        "CARD TOP-UP",
        "Top-up",
        {
          receiptId: "TU-0003",
          cardNumber: "1234 5678",
          customerName: "Mya Mya",
          amount: "50000.0000",
          balanceAfter: "120000.0000",
          printedAt: "2026-10-08T15:02:00",
        },
        "Cash"
      )
    ).join("\n");
    expect(text).toMatch(/Receipt No\s+TU-0003/);
    expect(text).toMatch(/Date\s+08 Oct 2026 15:02/);
    expect(text).toMatch(/Card no\s+1234 5678/);
    expect(text).toMatch(/Guest\s+Mya Mya/);
    expect(text).toMatch(/TOP-UP\s+50,000/);
    expect(text).toMatch(/Cash\s+50,000/);
    expect(text).toMatch(/Card balance\s+120,000/);
  });
});

describe("a KTV bill", () => {
  it("names the service and the room, not the old lounge brand", () => {
    const text = buildSaleReceiptLines({
      title: "Receipt",
      serviceType: "KTV",
      tableOrRoom: "K3",
      lines: [],
      total: "1000",
    }).join("\n");
    expect(text).toMatch(/Service\s+KTV/);
    expect(text).toMatch(/KTV\s+K3/);
    expect(text).not.toContain("Private VIP Lounge");
  });

  it("still calls a spa room a room", () => {
    const text = buildSaleReceiptLines({
      title: "Receipt",
      serviceType: "SPA",
      tableOrRoom: "S1",
      lines: [],
      total: "1000",
    }).join("\n");
    expect(text).toMatch(/Room\s+S1/);
  });
});

describe("kitchen slip design", () => {
  it("puts the station in reverse and the place in huge letters", () => {
    const printed = formatKitchenSlip({
      title: "KDS-0012",
      stationName: "Bar",
      place: "KTV K3",
      lines: [{ name: "Beer", quantity: "2" }],
    });
    expect(printed).toContain("\x1dB\x01");
    expect(printed).toContain("\x1b!\x38KTV K3");
    expect(printed).toContain("\x1b!\x182 x BEER");
  });

  it("shows the time sent, notes, seat and how many items", () => {
    const text = buildKitchenSlipLines({
      title: "KDS-0012",
      firedAt: "2026-10-08T14:51:00",
      tableOrRoom: "T12",
      cashier: "Aung Aung (ID: SHW0001)",
      lines: [
        { name: "Fried rice", quantity: "2", modifiers: "No chilli", seat: "3", remarks: "Allergy: nuts" },
        { name: "Tea", quantity: "1" },
      ],
    }).join("\n");
    expect(text).toContain("Table T12");
    expect(text).toMatch(/#KDS-0012\s+14:51/);
    expect(text).toContain("   + No chilli");
    expect(text).toContain("   Seat 3");
    expect(text).toContain("** Allergy: nuts **");
    expect(text).toContain("3 items");
    expect(text).toContain("Sent by Aung Aung (ID: SHW0001)");
  });

  it("says under the place how the order is served and for how many", () => {
    expect(
      kdsTicketPlaceDetail(
        new KdsTicket({
          serviceType: "DINE_IN",
          place: { kind: "TABLE", number: "T12", name: null, guestCount: 4 },
        })
      )
    ).toBe("Dine-in - 4 guests");
    expect(
      kdsTicketPlaceDetail(
        new KdsTicket({
          serviceType: "DINE_IN",
          place: { kind: "KTV_ROOM", number: "K3", name: "VIP", guestCount: 1 },
        })
      )
    ).toBe("VIP - 1 guest");
  });
});
