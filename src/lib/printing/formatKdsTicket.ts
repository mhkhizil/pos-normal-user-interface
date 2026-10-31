import { KdsTicket } from "@/core/domain/entities/Cashier";
import {
  PriceCurrency,
  PrintCompany,
  PrintPaperWidth,
  PrintTemplateSettings,
  PrintTemplateType,
} from "@/core/domain/entities/PrintTemplate";
import { cashierLabel } from "./cashier";
import {
  inlineIconCommand,
  needsUnicodeRaster,
  PrintIcon,
  PrintImage,
  rasterCommand,
  textPairToImage,
  textToImage,
} from "./printImage";

const ESC = "\x1b";
const GS = "\x1d";

export type PrintPlace = "KDS" | "CHECKOUT" | "FINANCE";

export interface PrintLine {
  name: string;
  quantity: string;
  categoryId?: string;
  categoryName?: string;
  altName?: string;
  unitPrice?: string;
  modifiers?: string;
  modifierPrices?: string;
  /** A running promotion on this item, such as "1+1". */
  promotion?: string;
  /** What that promotion took off this item. */
  promotionAmount?: string;
  remarks?: string;
  seat?: string;
}

export interface PrintParty {
  company?: PrintCompany | null;
  outletName?: string;
  address?: string;
  /** The phone number, when it is not the company's. */
  contact?: string;
  email?: string;
  cashier?: string;
  serviceType?: string;
  tableOrRoom?: string;
  pickupCode?: string;
  paidAt?: string;
  rounding?: string;
  startTime?: string;
  endTime?: string;
}

export interface KitchenSlip extends PrintParty {
  title: string;
  status?: string;
  courseType?: string;
  firedAt?: string;
  stationId?: string;
  stationName?: string;
  orderRef?: string;
  /** Where the food goes, printed huge: "Table T12", "KTV K3". */
  place?: string;
  /** Under the place: room name, service, guests. */
  placeDetail?: string;
  sentBy?: string;
  /**
   * A room's ticket (KTV or SPA). It reads like the room's bill, with its items
   * at receipt height instead of the kitchen's double-height line.
   */
  room?: boolean;
  lines?: PrintLine[];
  template?: PrintTemplateSettings;
  paperWidth?: PrintPaperWidth;
}

export interface SaleReceipt extends PrintParty {
  title: string;
  receiptId?: string;
  lines: PrintLine[];
  /** Label and value rows above the items, such as a card number. */
  facts?: Array<{ label: string; value: string }>;
  subtotal?: string;
  discount?: string;
  tax?: string;
  serviceCharge?: string;
  // extraFee and tip are not print-template fields, so they stay off the voucher.
  // extraFee?: string;
  // tip?: string;
  /** Labelled amounts above the total, such as a shift's sales and refunds. */
  amounts?: Array<{ label: string; amount: string }>;
  totalLabel?: string;
  total: string;
  payments?: Array<{ name: string; amount: string }>;
  change?: string;
  /** A guest card's balance after this slip. */
  balanceAfter?: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
  place?: PrintPlace;
  /** A paid bill: prints every copy its template asks for at checkout. */
  sale?: boolean;
  /** Which copy of a paid bill this is. */
  copy?: "CUSTOMER" | "ORDER_RECEIPT" | "FINANCE";
  /** The company logo as printer dots, printed at the top when the template shows it. */
  logo?: PrintImage | null;
  /** The template to print with, when it is not the one for `place`. */
  templateType?: PrintTemplateType;
  showLogo?: boolean;
  showPrices?: boolean;
  template?: PrintTemplateSettings;
  paperWidth?: PrintPaperWidth;
  /** Totals print as 100,000, or $ 100,000 for dollars; plain numbers without it. */
  currency?: PriceCurrency;
  /** The closing line; "Thank you!" on a customer's receipt when left out. */
  footer?: string;
}

export type PrintSize = "normal" | "tall" | "wide" | "huge";
export type PrintAlign = "left" | "center" | "right";
type Size = PrintSize;
type Align = PrintAlign;

interface TextStyle {
  align?: Align;
  size?: Size;
  bold?: boolean;
  invert?: boolean;
}

type Row =
  | ({ kind: "text"; text: string } & TextStyle)
  | ({ kind: "pair"; left: string; right: string } & TextStyle)
  | { kind: "rule"; char: string }
  | { kind: "gap" }
  | { kind: "image"; image: PrintImage }
  | { kind: "contact"; icon: PrintIcon; text: string };

const columnsFor = (paperWidth?: PrintPaperWidth) => (paperWidth === "MM80" ? 48 : 32);

const isWide = (size?: Size) => size === "wide" || size === "huge";

const graphemes = (text: string): string[] => {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" }
      ) => { segment(value: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (!Segmenter) return Array.from(text);
  return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (part) => part.segment
  );
};

const textWidth = (text: string) => graphemes(text).length;

/** Splits text into lines no wider than `width`, breaking between words. */
export function wrapText(text: string, width: number): string[] {
  const limit = Math.max(1, width);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = graphemes(word);
      while (rest.length > limit) {
        if (current) {
          lines.push(current);
          current = "";
        }
        lines.push(rest.slice(0, limit).join(""));
        rest = rest.slice(limit);
      }
      const remaining = rest.join("");
      if (!current) current = remaining;
      else if (textWidth(current) + 1 + rest.length <= limit) current += ` ${remaining}`;
      else {
        lines.push(current);
        current = remaining;
      }
    }
    lines.push(current);
  }
  return lines;
}

/** A slip laid out in rows, printed on a thermal printer or as a page. */
class Layout {
  readonly rows: Row[] = [];

  constructor(readonly width: number) {}

  columns(size?: Size) {
    return isWide(size) ? Math.floor(this.width / 2) : this.width;
  }

  line(text: string | undefined | null, style: TextStyle = {}) {
    if (!text?.trim()) return;
    for (const part of wrapText(text.trim(), this.columns(style.size))) {
      this.rows.push({ kind: "text", text: part, ...style });
    }
  }

  /** Text that keeps its leading spaces, wrapped under the same indent. */
  indented(indent: number, text: string | undefined | null, style: TextStyle = {}) {
    if (!text?.trim()) return;
    const pad = " ".repeat(indent);
    for (const part of wrapText(text.trim(), this.columns(style.size) - indent)) {
      this.rows.push({ kind: "text", text: `${pad}${part}`, ...style });
    }
  }

  /** "label ......... value", wrapping the label when the two do not fit. */
  pair(left: string, right: string | undefined | null, style: TextStyle = {}) {
    const columns = this.columns(style.size);
    const value = right?.trim() || "";
    if (!value) return this.line(left, style);
    const leftWidth = textWidth(left);
    const valueWidth = textWidth(value);
    if (leftWidth + 1 + valueWidth <= columns) {
      this.rows.push({ kind: "pair", left, right: value, ...style });
      return;
    }
    const room = columns - valueWidth - 1;
    if (room < 8) {
      this.line(left, style);
      this.line(value, { ...style, align: "right" });
      return;
    }
    const [first, ...rest] = wrapText(left, room);
    this.rows.push({ kind: "pair", left: first, right: value, ...style });
    for (const part of rest) this.rows.push({ kind: "text", text: part, ...style });
  }

  /** A label and its value, left out when there is no value. */
  field(label: string, value: string | undefined | null, style: TextStyle = {}) {
    if (value?.trim()) this.pair(label, value, style);
  }

  rule(char = "-") {
    this.rows.push({ kind: "rule", char });
  }

  image(image: PrintImage | null | undefined) {
    if (image?.width && image.height) this.rows.push({ kind: "image", image });
  }

  /** A phone number or email after its icon, centred. */
  contact(icon: PrintIcon, text: string | undefined | null) {
    if (text?.trim()) this.rows.push({ kind: "contact", icon, text: text.trim() });
  }

  gap() {
    if (this.rows.length && this.rows[this.rows.length - 1].kind !== "gap") {
      this.rows.push({ kind: "gap" });
    }
  }
}

const alignCode: Record<Align, string> = { left: "\x00", center: "\x01", right: "\x02" };

const printMode = (style: TextStyle) =>
  String.fromCharCode(
    (style.bold ? 0x08 : 0) |
      (style.size === "tall" || style.size === "huge" ? 0x10 : 0) |
      (isWide(style.size) ? 0x20 : 0)
  );

const centered = (text: string, columns: number) => {
  const space = Math.max(0, columns - textWidth(text));
  const left = Math.floor(space / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(space - left)}`;
};

// 48-dot line spacing is taller than the 24-dot font, so glyphs are not clipped.
const lineSpacing = `${ESC}3\x30`;
const bottomMargin = "\n".repeat(6);
const contactLabel: Record<PrintIcon, string> = { phone: "Tel", email: "Email" };

const unicodeRow = (text: string, style: TextStyle, columns: number) => {
  if (!needsUnicodeRaster(text)) return null;
  const image = textToImage(text, {
    width: columns * 12,
    align: style.invert ? "center" : style.align || "left",
    size: style.size,
    bold: style.bold,
    invert: style.invert,
  });
  return image ? `${ESC}a\x00${ESC}!\x00${GS}B\x00${rasterCommand(image)}` : null;
};

const pairText = (left: string, right: string, columns: number) =>
  `${left}${" ".repeat(Math.max(1, columns - textWidth(left) - textWidth(right)))}${right}`;

const unicodePairRow = (left: string, right: string, style: TextStyle, columns: number) => {
  if (!needsUnicodeRaster(left) && !needsUnicodeRaster(right)) return null;
  const image = textPairToImage(left, right, {
    width: columns * 12,
    size: style.size,
    bold: style.bold,
    invert: style.invert,
  });
  return image ? `${ESC}a\x00${ESC}!\x00${GS}B\x00${rasterCommand(image)}` : null;
};

const toEscPos = (layout: Layout) =>
  [
    `${ESC}@`,
    lineSpacing,
    ...layout.rows.map((row) => {
      if (row.kind === "gap") return "\n";
      if (row.kind === "image") return `${ESC}a\x01${rasterCommand(row.image)}`;
      if (row.kind === "contact") {
        const unicode = unicodeRow(
          `${contactLabel[row.icon]} ${row.text}`,
          { align: "center" },
          layout.width
        );
        if (unicode) return unicode;
        return `${ESC}a\x01${ESC}!\x00${inlineIconCommand(row.icon)} ${row.text}\n`;
      }
      if (row.kind === "rule") {
        return `${ESC}a\x00${ESC}!\x00${row.char.repeat(layout.width)}\n`;
      }
      if (row.kind === "pair") {
        const columns = layout.columns(row.size);
        const unicode = unicodePairRow(row.left, row.right, row, layout.width);
        if (unicode) return unicode;
        return [
          `${ESC}a${alignCode.left}`,
          `${ESC}!${printMode(row)}`,
          pairText(row.left, row.right, columns),
          "\n",
        ].join("");
      }
      const text = row.invert ? centered(row.text, layout.columns(row.size)) : row.text;
      const unicode = unicodeRow(text, row, layout.width);
      if (unicode) return unicode;
      return [
        `${ESC}a${alignCode[row.invert ? "left" : row.align || "left"]}`,
        `${ESC}!${printMode(row)}`,
        row.invert ? `${GS}B\x01` : "",
        text,
        row.invert ? `${GS}B\x00` : "",
        "\n",
      ].join("");
    }),
    `${ESC}!\x00${ESC}a\x00`,
    bottomMargin,
    `${GS}V\x00`,
  ].join("");

const toPlainLines = (layout: Layout) =>
  layout.rows.flatMap((row) => {
    if (row.kind === "image") return [];
    if (row.kind === "contact") {
      return centered(`${contactLabel[row.icon]} ${row.text}`, layout.width).trimEnd();
    }
    if (row.kind === "gap") return "";
    if (row.kind === "rule") return row.char.repeat(layout.width);
    if (row.kind === "pair") {
      return pairText(row.left, row.right, layout.columns(row.size));
    }
    if (row.invert) return centered(`*** ${row.text.trim()} ***`, layout.width);
    if (row.align === "center") return centered(row.text, layout.width).trimEnd();
    if (row.align === "right") return row.text.padStart(layout.width);
    return row.text;
  });

/** A slip as rows to draw on screen, styled as the printer would print them. */
export type SlipPreviewRow =
  | { kind: "text"; text: string; align: PrintAlign; size: PrintSize; bold: boolean; invert: boolean }
  | { kind: "rule"; text: string }
  | { kind: "gap" }
  | { kind: "image"; image: PrintImage }
  | { kind: "contact"; icon: PrintIcon; text: string };

export interface SlipPreview {
  columns: number;
  rows: SlipPreviewRow[];
}

const toPreview = (layout: Layout): SlipPreview => ({
  columns: layout.width,
  rows: layout.rows.map((row): SlipPreviewRow => {
    if (row.kind === "gap" || row.kind === "image" || row.kind === "contact") return row;
    if (row.kind === "rule") return { kind: "rule", text: row.char.repeat(layout.width) };
    if (row.kind === "pair") {
      return {
        kind: "text",
        text: pairText(row.left, row.right, layout.columns(row.size)),
        align: "left",
        size: row.size || "normal",
        bold: Boolean(row.bold),
        invert: Boolean(row.invert),
      };
    }
    return {
      kind: "text",
      text: row.invert ? row.text.trim() : row.text,
      align: row.invert ? "center" : row.align || "left",
      size: row.size || "normal",
      bold: Boolean(row.bold),
      invert: Boolean(row.invert),
    };
  }),
});

/** Money as a receipt shows it: 50350.0000 is "50,350", 12.5 is "12.50". */
export function printMoney(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  const whole = Math.round(amount * 100) % 100 === 0;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** An amount in the business's money: "100,000", "$ 100,000", "-$ 2,825". */
export function printAmount(
  value?: string | number | null,
  currency?: PriceCurrency
): string {
  const text = printMoney(value);
  if (!text || !currency || !Number.isFinite(Number(value))) return text;
  // Kyat is the shop's own money, so a slip prints the number on its own.
  if (currency !== "USD") return text;
  const sign = text.startsWith("-") ? "-" : "";
  const digits = sign ? text.slice(1) : text;
  return `${sign}$ ${digits}`;
}

const quantityText = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : value;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const twoDigits = (value: number) => String(value).padStart(2, "0");

const parseDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "14:51" */
const clockText = (value?: string | null) => {
  const date = parseDate(value);
  return date ? `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}` : value || "";
};

/** "08 Oct 2026 14:51", in plain letters any printer can show. */
export function formatPrintDate(value: string | Date): string {
  const date = parseDate(value);
  if (!date) return String(value);
  return `${twoDigits(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function formatReceiptDateTime(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  return parseDate(value) ? formatPrintDate(value) : undefined;
}

export function sessionPrintTimes(
  session?: { openedAt?: string | null; closedAt?: string | null } | null,
  endFallback?: string | Date | null
): Pick<PrintParty, "startTime" | "endTime"> {
  if (!session?.openedAt) return {};
  const endValue =
    session.closedAt ||
    (endFallback instanceof Date ? endFallback.toISOString() : endFallback);
  return {
    startTime: formatReceiptDateTime(session.openedAt),
    endTime: formatReceiptDateTime(endValue),
  };
}

const modifierRows = (item: PrintLine, showPrices: boolean) => {
  if (!item.modifiers?.trim()) return [];
  const prices = item.modifierPrices?.split(", ") || [];
  return item.modifiers.split(", ").map((name, index) => {
    const price = prices[index]?.trim();
    return showPrices && price && price !== "-" ? `+ ${name} (+${printMoney(price)})` : `+ ${name}`;
  });
};

const kitchenPlace = (slip: KitchenSlip) =>
  slip.place ||
  (slip.tableOrRoom
    ? `Table ${slip.tableOrRoom}`
    : slip.pickupCode
      ? `Pickup ${slip.pickupCode}`
      : undefined);

const kitchenItemSize = (fontSize?: string): Size =>
  fontSize === "LARGE" ? "huge" : fontSize === "SMALL" ? "normal" : "tall";

/** ESC/POS magnification, height then width: 2H1W is tall, 1H2W wide, 2H2W both. */
const SCALE_SIZE: Record<string, Size> = {
  "1H1W": "normal",
  "2H1W": "tall",
  "1H2W": "wide",
  "2H2W": "huge",
};

/**
 * How big items print. The text-size switch wins once it is moved off the
 * type's starting value; until then the older font-size switch decides, so a
 * template saved before keeps printing as it did.
 */
const itemSizeFor = (settings: PrintTemplateSettings | undefined, kitchen: boolean): Size => {
  const startingScale = kitchen ? "2H2W" : "1H1W";
  const scale = settings?.item.itemTextScale;
  if (scale && scale !== startingScale && SCALE_SIZE[scale]) return SCALE_SIZE[scale];
  if (kitchen) return kitchenItemSize(settings?.item.fontSize);
  return settings?.item.fontSize === "LARGE" ? "tall" : "normal";
};

/** The text-size switch's value that prints items the size they print now. */
export function itemTextScaleOf(settings: PrintTemplateSettings, kitchen: boolean): string {
  const size = itemSizeFor(settings, kitchen);
  return Object.keys(SCALE_SIZE).find((scale) => SCALE_SIZE[scale] === size) || "1H1W";
}

/** The size of everything that is not an item: who, where, when. */
const otherSizeFor = (settings?: PrintTemplateSettings): Size =>
  SCALE_SIZE[settings?.item.otherTextScale || ""] || "normal";

function kitchenLayout(slip: KitchenSlip): Layout {
  const settings = slip.template;
  const showPrices = settings ? settings.item.price : false;
  const showModifiers = settings ? settings.item.modifiers : true;
  const showOrderNumber = !settings || settings.other.orderNumber;
  const layout = new Layout(columnsFor(slip.paperWidth));

  layout.line((slip.stationName || "Kitchen").toUpperCase(), { bold: true, invert: true });
  if (settings?.header.outletName && slip.outletName) {
    layout.line(slip.outletName, { align: "center" });
  }
  const place = kitchenPlace(slip);
  if (place) {
    layout.gap();
    layout.line(place, { align: "center", size: "huge", bold: true });
  }
  const other = otherSizeFor(settings);
  layout.line(slip.placeDetail || slip.serviceType, { align: "center", size: other });
  layout.gap();
  layout.pair(`#${slip.title}`, clockText(slip.firedAt), { bold: true, size: other });
  if (showOrderNumber && slip.orderRef && slip.orderRef !== slip.title) {
    layout.line(`Order ${slip.orderRef}`, { size: other });
  }
  if (slip.courseType) layout.line(`Course ${slip.courseType}`, { size: other });
  layout.rule("=");

  const lines = slip.lines || [];
  // A room's ticket spaces its items like the room's bill: the checkout receipt
  // is the reference, so items print at its height rather than the kitchen's.
  const size = slip.room ? itemSizeFor(settings, false) : itemSizeFor(settings, true);
  lines.forEach((item, index) => {
    if (index) layout.gap();
    // The quantity leads the name with an "x" after it, as the receipt prints it.
    const lead = `${quantityText(item.quantity)} x `;
    const columns = layout.columns(size) - lead.length;
    const [first, ...rest] = wrapText(item.name.toUpperCase(), columns);
    layout.rows.push({ kind: "text", text: `${lead}${first}`, size, bold: true });
    for (const part of rest) {
      layout.rows.push({ kind: "text", text: `${" ".repeat(lead.length)}${part}`, size, bold: true });
    }
    if (settings?.item.bilingual) layout.indented(3, item.altName);
    if (showPrices && item.unitPrice) layout.indented(3, `@ ${printMoney(item.unitPrice)}`);
    if (showModifiers) {
      for (const modifier of modifierRows(item, showPrices)) layout.indented(3, modifier);
    }
    if (item.seat) layout.indented(3, `Seat ${item.seat}`);
    if (item.remarks?.trim()) layout.indented(3, `** ${item.remarks.trim()} **`, { bold: true });
  });
  if (lines.length) layout.rule("=");

  const count = lines.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  if (count) layout.line(`${count} ${count === 1 ? "item" : "items"}`, { bold: true, size: other });
  const sender = slip.sentBy || slip.cashier;
  if (sender) layout.line(`Sent by ${sender}`, { size: other });
  if (settings?.other.footerText) {
    layout.gap();
    layout.line(settings.other.footerText, { align: "center" });
  }
  return layout;
}

/** How a room service reads on paper, and what its place is called. */
const ROOM_SERVICES: Record<string, { name: string; place: string }> = {
  SPA: { name: "SPA", place: "Room" },
  KTV: { name: "KTV", place: "KTV" },
};

function receiptLayout(receipt: SaleReceipt): Layout {
  const place = receipt.place || "CHECKOUT";
  const finance = place === "FINANCE";
  const shift = receipt.templateType === "SHIFT";
  const settings = receipt.template;
  const shows = (flag?: boolean) => (settings ? Boolean(flag) : true);
  // A shift report is for the office: its header shows only what its template asks for.
  const headed = (flag?: boolean) => (shift ? Boolean(flag) : shows(flag));
  // The floor's copy of a bill, without money when the template says so.
  const priceless = receipt.copy === "ORDER_RECEIPT" && Boolean(settings?.item.hidePriceOnOrderBill);
  const showPrices = !priceless && (settings ? settings.item.price : receipt.showPrices !== false);
  const showBreakdown = !priceless && (settings ? settings.bill.amountAfterDiscount : !finance);
  const showTotal = !priceless && (shift || (settings ? settings.bill.totalPayment : true));
  const showPayments = !priceless && (settings ? settings.bill.totalPayment : !finance);
  const showOrderNumber = settings ? settings.other.orderNumber : !finance;
  const showModifiers = settings ? settings.item.modifiers : !finance;
  const qtyFirst = settings ? settings.item.qtyFirst : true;
  const itemSize = itemSizeFor(settings, false);
  const other = otherSizeFor(settings);
  const layout = new Layout(columnsFor(receipt.paperWidth));
  const company = finance || (shift && !settings?.header.outletName) ? null : receipt.company;

  if (receipt.showLogo !== false && (settings ? settings.header.logo : !finance && !shift)) {
    layout.image(receipt.logo);
    if (receipt.logo) layout.gap();
  }
  if (company?.name) {
    layout.line(company.name.toUpperCase(), { align: "center", size: "wide", bold: true });
    if (company.legalName && company.legalName !== company.name) {
      layout.line(company.legalName, { align: "center" });
    }
  }
  if (
    (settings ? settings.header.outletName : true) &&
    receipt.outletName &&
    receipt.outletName !== company?.name
  ) {
    layout.line(receipt.outletName, { align: "center", bold: !company?.name });
  }
  if (headed(settings?.header.address)) {
    layout.line(receipt.address || company?.address, { align: "center" });
  }
  if (headed(settings?.header.contact)) layout.contact("phone", receipt.contact || company?.phone);
  if (headed(settings?.header.email)) layout.contact("email", receipt.email || company?.email);
  if (layout.rows.length) layout.rule("=");

  layout.line(receipt.title.toUpperCase(), { align: "center", size: "tall", bold: true });
  layout.gap();
  if (showOrderNumber && receipt.receiptId) layout.field("Receipt No", receipt.receiptId, { size: other });
  layout.field(
    "Date",
    receipt.paidAt ? formatReceiptDateTime(receipt.paidAt) || receipt.paidAt : formatPrintDate(new Date()),
    { size: other }
  );
  const room = ROOM_SERVICES[String(receipt.serviceType).toUpperCase()];
  if (shows(settings?.other.serviceType)) {
    layout.field("Service", room?.name || receipt.serviceType, { size: other });
  }
  if (shows(settings?.other.tableOrRoom) && receipt.tableOrRoom) {
    layout.field(room?.place || "Table", receipt.tableOrRoom, { size: other });
  }
  if (shows(settings?.other.pickupCode)) layout.field("Pickup", receipt.pickupCode, { size: other });
  if (receipt.startTime) {
    layout.field(receipt.startTimeLabel || "Start", receipt.startTime, { size: other });
  }
  if (receipt.endTime) layout.field(receipt.endTimeLabel || "End", receipt.endTime, { size: other });
  if (shows(settings?.other.cashier) && receipt.cashier) {
    layout.field("Cashier", receipt.cashier, { size: other });
  }
  for (const fact of receipt.facts || []) layout.field(fact.label, fact.value, { size: other });

  if (receipt.lines.length) {
    layout.rule("-");
    receipt.lines.forEach((item, index) => {
      if (index) layout.gap();
      const quantity = quantityText(item.quantity);
      const unit = Number(item.unitPrice);
      const hasPrice = showPrices && item.unitPrice?.trim() && Number.isFinite(unit);
      const amount = hasPrice ? printMoney(unit * (Number(item.quantity) || 0)) : "";
      layout.pair(qtyFirst ? `${quantity} x ${item.name}` : `${item.name} x${quantity}`, amount, {
        size: itemSize,
      });
      if (settings?.item.bilingual) layout.indented(4, item.altName);
      if (hasPrice && Number(item.quantity) !== 1) {
        layout.indented(4, `${quantity} @ ${printMoney(unit)}`);
      }
      // A running promotion prints under its item: what the 1+1 took off here.
      const promotionAmount = Number(item.promotionAmount || 0);
      if (showPrices && promotionAmount > 0) {
        layout.pair(
          `    ${item.promotion?.trim() || "Promotion"}`,
          `-${printMoney(promotionAmount)}`
        );
      }
      if (showModifiers) {
        for (const modifier of modifierRows(item, showPrices)) layout.indented(4, modifier);
      }
      if (shows(settings?.item.productRemarks) && item.remarks?.trim()) {
        layout.indented(4, `* ${item.remarks.trim()}`);
      }
    });
  }

  if (settings?.item.categorySubtotal) {
    const totals = new Map<string, number>();
    for (const line of receipt.lines) {
      const name = line.categoryName || line.categoryId;
      const amount = Number(line.quantity) * Number(line.unitPrice);
      if (name && Number.isFinite(amount)) totals.set(name, (totals.get(name) || 0) + amount);
    }
    if (totals.size) {
      layout.rule("-");
      for (const [name, total] of totals) layout.pair(name, printMoney(total));
    }
  }

  const breakdown: Array<[string, string | undefined]> = showBreakdown
    ? [
        ["Subtotal", receipt.subtotal],
        ["Discount", receipt.discount],
        ["Tax", receipt.tax],
        ["Service charge", receipt.serviceCharge],
        ["Rounding", settings?.bill.rounding ? receipt.rounding : undefined],
      ]
    : [];
  const shownBreakdown = [
    ...breakdown,
    ...(receipt.amounts || []).map((row): [string, string] => [row.label, row.amount]),
  ].filter(([, value]) => value && Number(value) !== 0);
  if (shownBreakdown.length || showTotal) layout.rule("-");
  const amount = (value?: string | number | null) => printAmount(value, receipt.currency);
  for (const [label, value] of shownBreakdown) {
    const owed = label === "Discount" && Number(value) > 0 ? -Number(value) : value;
    layout.pair(label, amount(owed));
  }
  if (showTotal) {
    if (shownBreakdown.length) layout.rule("-");
    layout.pair(receipt.totalLabel || "TOTAL", amount(receipt.total), {
      size: "tall",
      bold: true,
    });
  }
  const payments = showPayments ? receipt.payments || [] : [];
  if (payments.length || receipt.change || receipt.balanceAfter) layout.rule("-");
  for (const payment of payments) layout.field(payment.name, amount(payment.amount));
  if (showPayments && receipt.change && Number(receipt.change) > 0) {
    layout.pair("Change", amount(receipt.change), { bold: true });
  }
  if (showPayments && settings?.bill.payTime && receipt.paidAt) {
    layout.field("Paid at", formatReceiptDateTime(receipt.paidAt) || receipt.paidAt);
  }
  if (receipt.balanceAfter) {
    layout.pair("Card balance", amount(receipt.balanceAfter), { bold: true });
  }
  layout.rule("=");
  const footer =
    receipt.footer ??
    (priceless ? "" : settings?.other.footerText || (finance || shift ? "" : "Thank you!"));
  layout.line(footer, { align: "center" });
  return layout;
}

export function formatKitchenSlip(slip: KitchenSlip): string {
  return toEscPos(kitchenLayout(slip));
}

export function buildKitchenSlipLines(slip: KitchenSlip): string[] {
  return toPlainLines(kitchenLayout(slip));
}

export function kitchenSlipPreview(slip: KitchenSlip): SlipPreview {
  return toPreview(kitchenLayout(slip));
}

export function saleReceiptPreview(receipt: SaleReceipt): SlipPreview {
  return toPreview(receiptLayout(receipt));
}

export function formatSaleReceipt(receipt: SaleReceipt): string {
  return toEscPos(receiptLayout(receipt));
}

export function buildSaleReceiptLines(receipt: SaleReceipt): string[] {
  return toPlainLines(receiptLayout(receipt));
}

export function kdsTicketPrintLines(ticket: KdsTicket): PrintLine[] {
  if (ticket.lines?.length) {
    return ticket.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      categoryId: line.categoryId,
      modifiers: line.modifiers,
      modifierPrices: line.modifierPrices,
    }));
  }
  return (ticket.kdsTicketLines || []).map((line) => ({
    name: line.productName || "Item",
    quantity: line.quantity || "1",
    modifiers: line.kitchenModifiers,
    modifierPrices: line.modifierPrices,
    seat: line.seatNumber ? String(line.seatNumber) : undefined,
  }));
}

/** The table, room or pickup a ticket is for, as the kitchen slip shows it. */
export function kdsTicketPlace(
  ticket: KdsTicket,
  tenantName?: string | null
): string | undefined {
  const place = ticket.place;
  if (place?.kind === "TABLE" && place.number) return `Table ${place.number}`;
  if (place?.kind === "SPA_ROOM" && place.number) return `SPA ${place.number}`;
  // A KTV room goes by the tenant's own name; only fall back to a generic one
  // when the company has not loaded.
  if (place?.kind === "KTV_ROOM" && place.number) {
    return `${tenantName?.trim() || "KTV"} ${place.number}`;
  }
  if (ticket.pickupNumber) return `Pickup ${ticket.pickupNumber}`;
  if (place?.kind === "COUNTER") return "Counter";
  return undefined;
}

const serviceText = (service?: string | null) => {
  if (!service) return undefined;
  const text = service.replaceAll("_", " ").toLowerCase();
  if (text === "dine in") return "Dine-in";
  if (text === "take away" || text === "takeaway") return "Takeaway";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Under the place: the room's name, how it is served and how many guests. */
export function kdsTicketPlaceDetail(ticket: KdsTicket): string | undefined {
  const place = ticket.place;
  const guests = place?.guestCount
    ? `${place.guestCount} ${place.guestCount === 1 ? "guest" : "guests"}`
    : undefined;
  const parts = [
    place?.name && place.name !== place.number ? place.name : undefined,
    place?.kind === "SPA_ROOM" || place?.kind === "KTV_ROOM"
      ? undefined
      : serviceText(ticket.serviceType),
    guests,
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : undefined;
}

/** Who sent a ticket: the staff member, or the room tablet it came from. */
export function kdsTicketSender(ticket: KdsTicket): string | undefined {
  if (ticket.sentFrom === "TABLET") return ticket.deviceName || "Room tablet";
  return cashierLabel(ticket.sentBy);
}

/** A ticket as the kitchen slip prints it. */
export function kdsTicketSlip(ticket: KdsTicket, tenantName?: string | null): KitchenSlip {
  return {
    title: ticket.ticketNumber || ticket.id,
    status: ticket.status,
    courseType: ticket.courseType,
    firedAt: ticket.firedAt,
    stationId: ticket.stationId || ticket.station?.id,
    stationName: ticket.station?.name,
    orderRef: ticket.orderNumber || undefined,
    place: kdsTicketPlace(ticket, tenantName),
    placeDetail: kdsTicketPlaceDetail(ticket),
    room: ticket.place?.kind === "KTV_ROOM" || ticket.place?.kind === "SPA_ROOM",
    sentBy: kdsTicketSender(ticket),
    lines: kdsTicketPrintLines(ticket),
  };
}

export function formatKdsTicket(ticket: KdsTicket): string {
  return formatKitchenSlip(kdsTicketSlip(ticket));
}

export function formatPrinterTest(name: string): string {
  const layout = new Layout(columnsFor());
  layout.line("PRINTER TEST", { align: "center", size: "wide", bold: true });
  layout.line(name, { align: "center" });
  layout.line("Connection verified", { align: "center" });
  layout.line(formatPrintDate(new Date()), { align: "center" });
  return toEscPos(layout);
}

export function buildPrinterTestLines(name: string): string[] {
  return ["PRINTER TEST", name, "Connection verified", formatPrintDate(new Date())];
}
