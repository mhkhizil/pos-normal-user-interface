import { describe, expect, it } from "vitest";
import { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import { formatKitchenSlip, formatSaleReceipt } from "../formatKdsTicket";
import { groupKitchenJobs } from "../routeKitchenPrint";

const binding = (id: string, backendPrinterId: string): PrinterBinding => ({
  id,
  backendPrinterId,
  transport: "NETWORK",
  displayName: id,
  lastVerifiedAt: "",
});

describe("station print routing", () => {
  it("sends drinks to the bar printer and snacks to fast food", () => {
    const plan = groupKitchenJobs(
      [
        { name: "Water", quantity: "1", categoryId: "drink" },
        { name: "Beer", quantity: "1", categoryId: "alcohol" },
        { name: "Fried chicken", quantity: "1", categoryId: "snack" },
      ],
      [binding("bar-printer", "printer-bar"), binding("food-printer", "printer-food")],
      null,
      undefined,
      [
        {
          id: "bar",
          name: "Bar",
          printerId: "printer-bar",
          categoryIds: ["drink", "alcohol"],
        },
        {
          id: "fast-food",
          name: "Fast food",
          printerId: "printer-food",
          categoryIds: ["snack"],
        },
      ]
    );

    expect(plan.unrouted).toEqual([]);
    expect(plan.jobs).toEqual([
      expect.objectContaining({
        lines: [
          expect.objectContaining({ name: "Water" }),
          expect.objectContaining({ name: "Beer" }),
        ],
      }),
      expect.objectContaining({
        lines: [expect.objectContaining({ name: "Fried chicken" })],
      }),
    ]);
    expect(plan.jobs[0].binding.id).toBe("bar-printer");
    expect(plan.jobs[1].binding.id).toBe("food-printer");
  });

  it("prints items with no station match on the default printer", () => {
    const fallback = binding("main", "printer-main");
    const plan = groupKitchenJobs(
      [{ name: "Soup", quantity: "1", categoryId: "other" }],
      [fallback],
      fallback,
      undefined,
      [
        {
          id: "bar",
          name: "Bar",
          printerId: "printer-bar",
          categoryIds: ["drink"],
        },
      ]
    );

    expect(plan.unrouted).toEqual([]);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].binding.id).toBe("main");
    expect(plan.jobs[0].lines).toEqual([
      expect.objectContaining({ name: "Soup" }),
    ]);
  });

  it("reprints a counter ticket on that station printer", () => {
    const plan = groupKitchenJobs(
      [{ name: "Fried chicken", quantity: "1" }],
      [binding("food-printer", "printer-food")],
      null,
      "fast-food",
      [
        {
          id: "fast-food",
          name: "Fast food",
          printerId: "printer-food",
          categoryIds: ["snack"],
        },
      ]
    );

    expect(plan.unrouted).toEqual([]);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].binding.id).toBe("food-printer");
    expect(plan.jobs[0].lines).toEqual([
      expect.objectContaining({ name: "Fried chicken" }),
    ]);
  });

  it("keeps prices off the KDS slip and the logo off the finance slip", () => {
    const kitchen = formatKitchenSlip({
      title: "KDS",
      lines: [{ name: "Beer", quantity: "1", unitPrice: "5.00" }],
    });
    const finance = formatSaleReceipt({
      title: "FINANCE",
      place: "FINANCE",
      lines: [{ name: "Beer", quantity: "1", unitPrice: "5.00" }],
      total: "5.00",
    });
    const checkout = formatSaleReceipt({
      title: "RECEIPT",
      place: "CHECKOUT",
      showLogo: true,
      lines: [{ name: "Beer", quantity: "1", unitPrice: "5.00" }],
      total: "5.00",
    });

    expect(kitchen).not.toContain("5.00");
    expect(finance).not.toContain("LOGO");
    expect(finance).toContain("5.00");
    expect(checkout).toContain("LOGO");
    expect(checkout).toContain("5.00");
  });
});
