import { describe, expect, it } from "vitest";
import { addToCart, cartKey, chargeItems, countOf, renote, unitPriceOf } from "../cart";

const ice = { modifierId: "extra-ice", name: "Extra ice", priceDelta: "500.0000" };

describe("the tablet cart", () => {
  it("keeps the same item with different choices on separate rows", () => {
    let cart = addToCart({}, { variantId: "beer", modifiers: [] }, 1);
    cart = addToCart(cart, { variantId: "beer", modifiers: [ice], note: "Cold glass" }, 2);
    cart = addToCart(cart, { variantId: "beer", modifiers: [] }, 1);

    expect(Object.keys(cart)).toHaveLength(2);
    expect(countOf(cart, "beer")).toBe(4);
    expect(cart[cartKey({ variantId: "beer", modifiers: [] })].quantity).toBe(2);
  });

  it("takes a row away at 0", () => {
    const cart = addToCart(addToCart({}, { variantId: "beer", modifiers: [] }, 1), { variantId: "beer", modifiers: [] }, -1);
    expect(cart).toEqual({});
  });

  it("joins a row whose new note matches another", () => {
    let cart = addToCart({}, { variantId: "rice", modifiers: [], note: "No onion" }, 1);
    cart = addToCart(cart, { variantId: "rice", modifiers: [] }, 2);
    const key = cartKey({ variantId: "rice", modifiers: [] });

    cart = renote(cart, key, "No onion");

    expect(Object.values(cart)).toEqual([{ variantId: "rice", modifiers: [], note: "No onion", quantity: 3 }]);
  });

  it("prices options on top of the item, and sends only their ids and the note", () => {
    const cart = addToCart({}, { variantId: "beer", modifiers: [ice], note: "Cold glass" }, 2);

    expect(unitPriceOf("3500.0000", [ice])).toBe(4000);
    expect(chargeItems(cart)).toEqual([
      { variantId: "beer", quantity: 2, selectedModifiers: [{ modifierId: "extra-ice" }], note: "Cold glass" },
    ]);
    expect(chargeItems(addToCart({}, { variantId: "tea", modifiers: [] }, 1))).toEqual([
      { variantId: "tea", quantity: 1 },
    ]);
  });
});
