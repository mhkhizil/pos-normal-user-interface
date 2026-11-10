const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatPosQuantity(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(parsed);
}

/** Money as the till shows it: two decimals, however exact the API's figures are. */
export function formatPosMoney(value: string | number | null | undefined): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function salesOrderServiceTypeKey(serviceType?: string): string {
  switch (String(serviceType || "").toUpperCase()) {
    case "TABLE":
      return "cashier.serviceTypes.table";
    case "TAKE_AWAY":
    case "TAKEAWAY":
      return "cashier.serviceTypes.takeAway";
    case "DELIVERY":
      return "cashier.serviceTypes.delivery";
    case "PICK_UP":
    case "COUNTER":
      return "cashier.serviceTypes.pickUp";
    default:
      return "cashier.serviceTypes.dineIn";
  }
}

export function salesOrderStatusKey(status?: string): string {
  switch (String(status || "").toUpperCase()) {
    case "COMPLETED":
      return "salesOrders.status.completed";
    case "VOIDED":
    case "CANCELLED":
      return "salesOrders.status.voided";
    case "ON_HOLD_CREDIT":
      return "salesOrders.status.onHold";
    case "REFUNDED":
      return "salesOrders.status.refunded";
    case "PARTIALLY_REFUNDED":
      return "salesOrders.status.partiallyRefunded";
    default:
      return "salesOrders.status.open";
  }
}

export function isHumanDisplayName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text.length > 0 && !UUID_LIKE.test(text);
}

/**
 * The options a variant was sold as ("Large", "Large / Black"), never its SKU: a
 * product with only its default variant has none, and reads as just its name.
 */
export function variantOptionsName(variant: {
  variantName?: string | null;
  matrixOptions?: Record<string, unknown> | null;
}): string {
  if (isHumanDisplayName(variant.variantName)) return variant.variantName.trim();
  return Object.values(variant.matrixOptions || {})
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" / ");
}

/** An item named with its variant, "Beer (Large)"; unchanged when there is none. */
export function withVariant(name: string, variant?: string | null): string {
  const label = String(variant ?? "").trim();
  const base = name.trim();
  if (!label || label === base || base.endsWith(`(${label})`)) return name;
  return `${base} (${label})`;
}

export function lineDisplayName(line: {
  productName?: string;
  variantName?: string;
  sku?: string;
}): string {
  if (isHumanDisplayName(line.productName)) {
    return withVariant(line.productName.trim(), variantOptionsName(line));
  }
  if (isHumanDisplayName(line.variantName)) return line.variantName.trim();
  if (isHumanDisplayName(line.sku)) return line.sku.trim();
  return "";
}

/** An order's lines by id, so a refund can show an item's name instead of its line id. */
export function orderLineLabelsById(
  lines: Array<{
    id?: string;
    productName?: string;
    variantName?: string;
    sku?: string;
  }>
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const line of lines) {
    const id = String(line.id || "").trim();
    const name = id ? lineDisplayName(line) : "";
    if (id && name) labels.set(id, name);
  }
  return labels;
}

/** The name of the item a refund line gives back, when the order's lines are loaded. */
export function refundLineName(
  line: { salesOrderLineId?: string },
  labels: Map<string, string>
): string | undefined {
  return labels.get(String(line.salesOrderLineId || "").trim());
}

/** A refund line's title: the item's name, or its sales order line id when it cannot be resolved. */
export function refundLineLabel(
  line: { salesOrderLineId?: string },
  labels: Map<string, string>
): string {
  return refundLineName(line, labels) || String(line.salesOrderLineId || "");
}

/**
 * A variant as the till names it: the name the order saved it with, else the
 * catalogue's readable options ("Large / Black"), else its SKU. A line whose
 * variant is unknown reads as an empty string, so callers can hide the row.
 */
export function variantDisplayName(variant: {
  variantName?: string;
  name?: string;
  sku?: string;
  variantSku?: string;
  matrixOptions?: Record<string, unknown>;
}): string {
  const named = [variant.variantName, variant.name].find(isHumanDisplayName);
  if (named) return String(named).trim();
  const options = Object.values(variant.matrixOptions || {})
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" / ");
  if (options) return options;
  const code = [variant.variantSku, variant.sku].find(isHumanDisplayName);
  return code ? String(code).trim() : "";
}
