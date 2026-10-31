import { afterEach, describe, expect, it } from "vitest";
import i18n, { normalizeAppLanguage, setAppLanguage } from "../index";
import en from "../locales/en.json";
import my from "../locales/my.json";

const ALLOW_SAME = new Set([
  "English",
  "မြန်မာ",
  "v{{version}}",
  "you@example.com",
  "—",
  "+1",
  "-1",
  "USB",
  "FOC",
  "PIN",
  "MEMBER CARD",
  "Tenant ID",
  "{{bps}} bps",
  // A lounge is named KTV in both languages, like the other product names above.
  "KTV",
  "KTV {{number}}",
]);

type Tree = Record<string, unknown>;

function flatten(obj: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Tree, path));
    } else if (typeof value === "string") {
      out[path] = value;
    }
  }
  return out;
}

const PAGE_KEYS = [
  "dashboard.title",
  "salesSummary.title",
  "login.title",
  "users.title",
  "crm.addCustomer",
  "cards.title",
  "cardTopup.title",
  "cardRefund.title",
  "cashier.waitlistTitle",
  "cashier.tipPool.title",
  "cashier.payNow",
  "salesOrders.detailTitle",
  "counterOrders.title",
  "sync.title",
  "settings.tabs.cashier",
  "notFound.title",
];

describe("locale coverage", () => {
  afterEach(async () => {
    await setAppLanguage("en");
  });

  it("mirrors every English key in Burmese", () => {
    const enKeys = Object.keys(flatten(en as Tree)).sort();
    expect(Object.keys(flatten(my as Tree)).sort()).toEqual(enKeys);
  });

  it("translates page copy instead of leaving English fallbacks", () => {
    const english = flatten(en as Tree);
    const burmese = flatten(my as Tree);

    const leftover: string[] = [];
    for (const [path, enValue] of Object.entries(english)) {
      if (ALLOW_SAME.has(enValue)) continue;
      if (burmese[path] === enValue) leftover.push(path);
    }

    expect(leftover).toEqual([]);
  });

  it("falls back to English for unsupported languages", () => {
    expect(normalizeAppLanguage("ko")).toBe("en");
    expect(normalizeAppLanguage("zh-CN")).toBe("en");
    expect(normalizeAppLanguage("zh")).toBe("en");
  });

  it("switches page namespaces for Burmese", async () => {
    await setAppLanguage("my");
    expect(normalizeAppLanguage(i18n.language)).toBe("my");
    for (const key of PAGE_KEYS) {
      const english = i18n.getFixedT("en")(key);
      expect(i18n.t(key), `my ${key}`).not.toBe(english);
    }
  });
});
