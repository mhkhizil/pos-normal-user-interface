import { describe, expect, it, vi } from "vitest";
import { ApiPrintTemplateRepository } from "@/core/infrastructure/repositories/ApiPrintTemplateRepository";
import type { HttpClient } from "@/core/infrastructure/api/HttpClient";
import { buildSaleReceiptLines } from "@/lib/printing/formatKdsTicket";
import {
  defaultPrintTemplateSettings,
  type PrintTemplateSettings,
} from "@/core/domain/entities/PrintTemplate";

/**
 * A saved checkout template whose Email / Phone / Address toggles were turned
 * off. The server can hand those flags back as booleans, as the strings the
 * form posts, or as 0/1; whatever the shape, the mapper must keep them off —
 * otherwise the bill prints the company's address, phone and email again.
 */
const repository = (data: unknown) =>
  new ApiPrintTemplateRepository({
    get: vi.fn().mockResolvedValue({ success: true, data }),
  } as unknown as HttpClient);

const templateRow = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  type: "RECEIPT",
  name: "Checkout",
  paperWidth: "MM80",
  ...overrides,
});

const loadTemplate = async (overrides: Record<string, unknown> = {}) =>
  repository(templateRow(overrides)).getById("t1");

const allOff = { address: false, contact: false, email: false };
const allOffFlags = (header: Record<string, boolean>) => [
  header.address,
  header.contact,
  header.email,
];

describe("ApiPrintTemplateRepository — header toggles stay off", () => {
  it("keeps boolean false header flags false", async () => {
    const { settings } = await loadTemplate({ settings: { header: allOff } });

    expect(allOffFlags(settings.header)).toEqual([false, false, false]);
  });

  it("keeps string \"false\" header flags false", async () => {
    const { settings } = await loadTemplate({
      settings: { header: { address: "false", contact: "false", email: "false" } },
    });

    expect(allOffFlags(settings.header)).toEqual([false, false, false]);
  });

  it("keeps numeric 0 header flags false", async () => {
    const { settings } = await loadTemplate({
      settings: { header: { address: 0, contact: 0, email: 0 } },
    });

    expect(allOffFlags(settings.header)).toEqual([false, false, false]);
  });

  it("reads settings stored as a JSON string", async () => {
    const { settings } = await loadTemplate({
      settings: JSON.stringify({
        header: allOff,
        copies: ["CUSTOMER", "FINANCE"],
        other: { footerText: "Bye" },
      }),
    });

    expect.soft(allOffFlags(settings.header)).toEqual([false, false, false]);
    expect.soft(settings.copies).toEqual(["CUSTOMER", "FINANCE"]);
    expect.soft(settings.other.footerText).toBe("Bye");
  });

  it("reads isDefault sent as a string", async () => {
    const off = await loadTemplate({ isDefault: "false" });
    const on = await loadTemplate({ isDefault: "true" });

    expect(off.isDefault).toBe(false);
    expect(on.isDefault).toBe(true);
  });
});

const receipt = (template: PrintTemplateSettings) => ({
  title: "RECEIPT",
  lines: [{ name: "Beer", quantity: "2", unitPrice: "5000" }],
  total: "10000",
  company: {
    name: "Golden Club",
    legalName: "Golden Club Co Ltd",
    address: "12 Strand Road, Yangon",
    phone: "09 7700 1234",
    email: "hello@golden.club",
  },
  template,
});

const silentHeader = (): PrintTemplateSettings => ({
  ...defaultPrintTemplateSettings(),
  header: { logo: false, outletName: false, ...allOff },
});

const paper = (template: PrintTemplateSettings) =>
  buildSaleReceiptLines(receipt(template)).join("\n");

describe("sale receipt header flags", () => {
  it("prints no address, phone or email when the toggles are off", () => {
    const text = paper(silentHeader());

    expect(text).not.toContain("12 Strand Road");
    expect(text).not.toContain("09 7700 1234");
    expect(text).not.toContain("hello@");
  });

  it("prints all three when the toggles are on", () => {
    const text = paper(defaultPrintTemplateSettings());

    expect(text).toContain("12 Strand Road");
    expect(text).toContain("09 7700 1234");
    expect(text).toContain("hello@");
  });

  it("prints no business name when the outlet name toggle is off", () => {
    const text = paper(silentHeader());

    expect(text).not.toContain("GOLDEN CLUB");
    expect(text).not.toContain("Golden Club Co Ltd");
    // With the switch on the name still heads the slip.
    expect(paper(defaultPrintTemplateSettings())).toContain("GOLDEN CLUB");
  });
});
