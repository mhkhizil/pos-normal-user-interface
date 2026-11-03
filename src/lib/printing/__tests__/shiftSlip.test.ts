import { describe, expect, it } from "vitest";
import { defaultPrintTemplateSettings } from "@/core/domain/entities/PrintTemplate";
import { buildSaleReceiptLines } from "../formatKdsTicket";
import { shiftSlip } from "../shiftSlip";

const summary = {
  sessionId: "shift-1",
  registerName: "Front desk",
  cashierName: "Ma Aye",
  openedAt: "2026-10-07T08:00:00",
  closedAt: "2026-10-07T16:00:00",
  openingCashFloat: 0,
  expectedClosingCash: 0,
  actualClosingCash: null,
  cashVariance: null,
  totalSales: 70000,
  totalRefunds: 5000,
  netTotal: 65000,
  salesCount: 4,
  refundCount: 1,
  nonSalesCashIn: 0,
  nonSalesCashOut: 0,
  paymentBreakdown: [{ methodName: "Cash", transactionCount: 3, totalAmount: 40000 }],
};

const shiftTemplate = () => {
  const settings = defaultPrintTemplateSettings();
  settings.header = { logo: false, outletName: true, address: false, contact: false, email: false };
  settings.other.footerText = "";
  return settings;
};

const company = { name: "Grand Spa", address: "No. 12, Pyay Road", phone: "09 123" };

describe("the shift report slip", () => {
  it("asks for the shift template", () => {
    expect(shiftSlip(summary).templateType).toBe("SHIFT");
  });

  it("heads the report with the business name only, as its template starts", () => {
    const text = buildSaleReceiptLines({
      ...shiftSlip(summary),
      company,
      template: shiftTemplate(),
    }).join("\n");
    expect(text).toContain("GRAND SPA");
    expect(text).not.toContain("Pyay Road");
    expect(text).not.toContain("Tel 09 123");
  });

  it("follows its template: no business name, no cashier, no payments, a footer", () => {
    const template = shiftTemplate();
    template.header.outletName = false;
    template.other.cashier = false;
    template.bill.totalPayment = false;
    template.other.footerText = "Count the drawer";
    const text = buildSaleReceiptLines({
      ...shiftSlip(summary),
      company,
      template,
      currency: "MMK",
    }).join("\n");
    expect(text).not.toContain("GRAND SPA");
    expect(text).not.toContain("Ma Aye");
    expect(text).not.toMatch(/Cash \(3\)/);
    expect(text).toMatch(/NET\s+65,000/);
    expect(text).toContain("Count the drawer");
  });

  it("prints the till, cashier, sales, refunds, net and each payment type", () => {
    const slip = shiftSlip({
      sessionId: "shift-1",
      registerName: "Front desk",
      cashierName: "Ma Aye",
      openedAt: "2026-10-07T08:00:00",
      closedAt: "2026-10-07T16:00:00",
      openingCashFloat: 0,
      expectedClosingCash: 0,
      actualClosingCash: null,
      cashVariance: null,
      totalSales: 70000,
      totalRefunds: 5000,
      netTotal: 65000,
      salesCount: 4,
      refundCount: 1,
      nonSalesCashIn: 0,
      nonSalesCashOut: 0,
      paymentBreakdown: [{ methodName: "Cash", transactionCount: 3, totalAmount: 40000 }],
    });
    const text = buildSaleReceiptLines({ ...slip, currency: "MMK" }).join("\n");

    expect(text).toContain("SHIFT REPORT");
    expect(text).toMatch(/POS device\s+Front desk/);
    expect(text).toMatch(/Cashier\s+Ma Aye/);
    expect(text).toMatch(/Opened\s+07 Oct 2026 08:00/);
    expect(text).toMatch(/Closed\s+07 Oct 2026 16:00/);
    expect(text).toMatch(/Sales\s+4 bills/);
    expect(text).toMatch(/Sales\s+70,000/);
    expect(text).toMatch(/Refunds\s+-5,000/);
    expect(text).toMatch(/NET\s+65,000/);
    expect(text).toMatch(/Cash \(3\)\s+40,000/);
    expect(text).not.toContain("Thank you!");
  });

  it("prints the shift's tips when it took any", () => {
    const withTips = buildSaleReceiptLines({
      ...shiftSlip({ ...summary, tipAmount: 3000 }),
      currency: "MMK",
    }).join("\n");
    expect(withTips).toMatch(/Tips\s+3,000/);

    // A shift with no tips says nothing about them.
    const withoutTips = buildSaleReceiptLines({
      ...shiftSlip(summary),
      currency: "MMK",
    }).join("\n");
    expect(withoutTips).not.toContain("Tips");
  });

  it("prints the sales by group: each station, rooms in hours, take-away and credit", () => {
    const text = buildSaleReceiptLines({
      ...shiftSlip({
        ...summary,
        groups: {
          sections: [
            {
              key: "k",
              kind: "STATION",
              name: "Kitchen",
              items: [{ variantId: "v", name: "Fried rice", quantity: 27, amount: 135000 }],
              quantity: 27,
              amount: 135000,
            },
            { key: "staff-meal", kind: "STAFF_MEAL", name: null, items: [], quantity: 0, amount: 0 },
          ],
          rooms: { rows: [{ room: "3", hours: 6.5, amount: 195000 }], hours: 6.5, amount: 195000 },
          takeaway: { orders: 3, amount: 42000 },
          credit: {
            rows: [{ account: "U Kyaw", orderNumber: "SO-1234", amount: 85000 }],
            amount: 85000,
          },
        },
      }),
      template: shiftTemplate(),
    }).join("\n");

    expect(text).toContain("KITCHEN");
    expect(text).toMatch(/27 x Fried rice\s+135,000/);
    expect(text).toContain("STAFF MEAL");
    expect(text).toMatch(/6\.5 h x 3\s+195,000/);
    expect(text).toMatch(/Total 3 orders\s+42,000/);
    expect(text).toMatch(/U Kyaw SO-1234\s+85,000/);
    expect(text.indexOf("KITCHEN")).toBeLessThan(text.indexOf("NET"));
  });
});
