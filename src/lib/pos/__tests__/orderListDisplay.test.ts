import { describe, expect, it } from "vitest";
import {
  formatPosMoney,
  formatPosQuantity,
  lineDisplayName,
  salesOrderServiceTypeKey,
  salesOrderStatusKey,
  variantDisplayName,
  withVariant,
  variantOptionsName,
} from "../orderListDisplay";

describe("orderListDisplay", () => {
  it("formats quantities without trailing four-decimal zeros", () => {
    expect(formatPosQuantity("1.0000")).toBe("1");
    expect(formatPosQuantity("1.5000")).toBe("1.5");
  });

  it("shows money with two decimals, however exact the API's figures are", () => {
    expect(formatPosMoney("2600.0000")).toBe("2,600.00");
    expect(formatPosMoney("1234567.5")).toBe("1,234,567.50");
    expect(formatPosMoney(0)).toBe("0.00");
    expect(formatPosMoney(undefined)).toBe("0.00");
    expect(formatPosMoney("not a number")).toBe("0.00");
  });

  it("maps service and status codes to POS labels", () => {
    expect(salesOrderServiceTypeKey("PICK_UP")).toBe("cashier.serviceTypes.pickUp");
    expect(salesOrderStatusKey("DRAFT")).toBe("salesOrders.status.open");
    expect(salesOrderStatusKey("VOIDED")).toBe("salesOrders.status.voided");
  });

  it("prefers product names over raw SKUs", () => {
    expect(
      lineDisplayName({
        productName: "Coffee",
        sku: "COFFEE-LARGE",
      })
    ).toBe("Coffee");
    expect(lineDisplayName({ sku: "COFFEE-LARGE" })).toBe("COFFEE-LARGE");
    expect(
      lineDisplayName({
        productName: "3f2a0d1c-7b4e-4c2a-9f11-aaaaaaaaaaaa",
      })
    ).toBe("");
  });

  it("names a line's variant: its name, else its options, else its SKU", () => {
    expect(variantDisplayName({ variantName: "Large" })).toBe("Large");
    expect(
      variantDisplayName({ matrixOptions: { size: "Large", color: "Black" } })
    ).toBe("Large / Black");
    expect(variantDisplayName({ variantSku: "COFFEE-LARGE" })).toBe("COFFEE-LARGE");
    expect(variantDisplayName({ sku: "LEO-01" })).toBe("LEO-01");
    expect(variantDisplayName({})).toBe("");
  });
});

describe("variants in item names", () => {
  it("names a line with the variant it was sold as", () => {
    expect(lineDisplayName({ productName: "Beer", variantName: "Large" })).toBe("Beer (Large)");
  });

  it("leaves an item with no variant as just its name", () => {
    expect(lineDisplayName({ productName: "Fried rice" })).toBe("Fried rice");
    expect(lineDisplayName({ productName: "Tea", variantName: "Tea" })).toBe("Tea");
  });

  it("does not name the variant twice", () => {
    expect(withVariant("Beer (Large)", "Large")).toBe("Beer (Large)");
  });

  it("reads a catalogue variant by its options, never its SKU", () => {
    expect(variantOptionsName({ matrixOptions: { size: "Large", colour: "Black" } })).toBe(
      "Large / Black"
    );
    expect(variantOptionsName({ matrixOptions: {} })).toBe("");
  });
});
