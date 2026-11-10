import { afterEach, describe, expect, it, vi } from "vitest";
import { printDocumentHtml, printLinesWithBrowserDialog } from "../documentPrint";
import { kitchenSlipPreview } from "../formatKdsTicket";
import { defaultPrintTemplateSettings } from "@/core/domain/entities/PrintTemplate";

const PAPER_WIDTH_MM = 80;
const COLUMNS = 48;

/** 12px expressed in mm: the hard-coded desktop body size we expect to disappear. */
const TWELVE_PX_MM = (12 * 25.4) / 96;

const MM_PER_UNIT: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  px: 25.4 / 96,
};

/** The HTML the desktop print document writes, as one string. */
const printedHtml = async (): Promise<string> => {
  const printDocument = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
  const printWindow = { document: printDocument, opener: null, close: vi.fn() };
  vi.stubGlobal("open", vi.fn().mockReturnValue(printWindow));
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

  await printLinesWithBrowserDialog(["2 x BEER", "2 x STEAK"], "KDS-0042", PAPER_WIDTH_MM, {
    columns: COLUMNS,
    rows: [
      {
        kind: "text",
        text: "2 x BEER",
        align: "left",
        size: "normal",
        bold: true,
        invert: false,
      },
      {
        kind: "text",
        text: "2 x STEAK",
        align: "left",
        size: "huge",
        bold: true,
        invert: false,
      },
    ],
  });

  expect(printDocument.write).toHaveBeenCalled();
  return printDocument.write.mock.calls.map((call) => String(call[0])).join("");
};

const styleSheet = (html: string): string => {
  const start = html.indexOf("<style>");
  const end = html.indexOf("</style>");
  return start >= 0 && end > start ? html.slice(start + "<style>".length, end) : "";
};

/** Every `font:` / `font-size:` value in the given CSS text. */
const fontDeclarations = (cssText: string): string[] =>
  [
    ...cssText.matchAll(/(?:^|[;{\s])font-size\s*:\s*([^;}]+)/g),
    ...cssText.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g),
  ].map((match) => match[1].trim());

/** The bodies of the document's `body { ... }` rules, joined. */
const bodyRules = (html: string): string => {
  const css = styleSheet(html);
  return [...css.matchAll(/(?:^|[}{\s])body\s*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .join(";");
};

const lengthToMm = (declaration: string, baseMm: number): number | undefined => {
  const match = declaration.match(/([\d.]+)\s*(mm|cm|in|pt|px|em|rem|%)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "em" || unit === "rem") return value * baseMm;
  if (unit === "%") return (value / 100) * baseMm;
  return value * (MM_PER_UNIT[unit] ?? 1);
};

const sizeFromCss = (cssText: string, baseMm: number): number | undefined => {
  for (const declaration of fontDeclarations(cssText)) {
    const size = lengthToMm(declaration, baseMm);
    if (size !== undefined) return size;
  }
  return undefined;
};

/** The base font size the document declares on `body`, in mm. */
const baseSizeMm = (html: string): number | undefined => {
  const rules = bodyRules(html);
  return rules ? sizeFromCss(rules, TWELVE_PX_MM) : undefined;
};

/** The markup of the row that holds `text`, nested spans included. */
const rowChunk = (html: string, text: string): string => {
  const index = html.indexOf(text);
  expect(index, `the print document does not render "${text}"`).toBeGreaterThanOrEqual(0);
  const divStart = html.lastIndexOf("<div", index);
  const spanStart = html.lastIndexOf("<span", index);
  const start = divStart >= 0 ? divStart : spanStart;
  const end = html.indexOf("</div>", index);
  return html.slice(start >= 0 ? start : index, end >= 0 ? end + "</div>".length : html.length);
};

const classNamesIn = (markup: string): string[] =>
  [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/).filter(Boolean));

const classRules = (css: string, className: string): string =>
  [
    ...css.matchAll(new RegExp(`\\.${className}(?![\\w-])[^{]*\\{([^}]*)\\}`, "g")),
  ]
    .map((match) => match[1])
    .join(";");

/**
 * The font size the row resolves to, in mm: inline `style`, or a class rule in
 * the printed stylesheet, falling back to the document's base size.
 */
const rowSizeMm = (html: string, text: string): number => {
  const base = baseSizeMm(html) ?? TWELVE_PX_MM;
  const chunk = rowChunk(html, text);
  const css = styleSheet(html);
  const sizes = [sizeFromCss(chunk, base)];
  for (const className of classNamesIn(chunk)) {
    sizes.push(sizeFromCss(classRules(css, className), base));
  }
  const known = sizes.filter((size): size is number => size !== undefined);
  return known.length ? Math.max(...known) : base;
};

describe("desktop browser print document", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prints the huge slip row at twice the normal row's font size", async () => {
    const html = await printedHtml();
    const normal = rowSizeMm(html, "2 x BEER");
    const huge = rowSizeMm(html, "2 x STEAK");

    expect(huge).toBeGreaterThan(normal);
    expect(huge / normal).toBeCloseTo(2, 2);
  });

  it("derives the base font size from the columns and paper width, not a fixed 12px", async () => {
    const html = await printedHtml();

    // Today the document writes `font: 600 12px/1.35 "Courier New", monospace`,
    // so 48 columns overflow 80mm and the slip's own sizes cannot win.
    expect(bodyRules(html), "the print document must declare a body font").toBeTruthy();
    expect(bodyRules(html)).not.toMatch(/\b12px\b/);

    const base = baseSizeMm(html);
    expect(base, "the body font must declare a size").not.toBeUndefined();
    const baseMm = base ?? Number.NaN;

    // 80mm / 48 columns ≈ 1.7mm, and 2.5mm (7.3pt) still fits; 12px is 3.18mm.
    expect(baseMm).toBeGreaterThan(1);
    expect(baseMm).toBeLessThan(2.8);
    // 48 Courier cells (0.6em each) must fit the paper width.
    expect(baseMm * COLUMNS * 0.6).toBeLessThanOrEqual(PAPER_WIDTH_MM * 1.05);
  });

  it("magnifies each size once, so a huge row is not clipped", () => {
    const css = styleSheet(printDocumentHtml([], "KDS-0042", PAPER_WIDTH_MM));
    const rule = (selector: string) =>
      new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] || "";

    // A tall row is 2H1W: twice the height, the same width.
    expect(rule(".tall")).toContain("font-size: 2em");
    expect(rule(".tall")).toContain("scaleX(0.5)");
    // A wide row is 1H2W: the layout halved its columns, the scale doubles them back.
    expect(rule(".wide")).toContain("scaleX(2)");
    expect(rule(".wide")).not.toContain("font-size");
    // A huge row is 2H2W: the doubled font already fills the halved columns, so
    // scaling it again would print twice the paper width and clip the line.
    expect(rule(".huge")).toContain("font-size: 2em");
    expect(rule(".huge")).not.toContain("scaleX");
  });

  it("prints a KDS ticket at the size its template asks for", () => {
    const kitchen = (template: ReturnType<typeof defaultPrintTemplateSettings>) =>
      printDocumentHtml([], "KDS-0042", PAPER_WIDTH_MM, kitchenSlipPreview({
        title: "KDS-0042",
        stationName: "Bar",
        lines: [{ name: "Beer", quantity: "2" }],
        template,
      }));

    // Normal: the item row is a plain line, however big the printer's own default.
    const normal = kitchen(defaultPrintTemplateSettings());
    expect(normal).toContain('class="line normal left bold"');
    expect(normal).not.toContain("line huge");

    const big = defaultPrintTemplateSettings();
    big.item.itemTextScale = "2H2W";
    big.item.otherTextScale = "2H2W";
    expect(kitchen(big)).toContain("line huge");
  });
});
