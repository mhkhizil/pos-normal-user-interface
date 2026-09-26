import { describe, expect, it } from "vitest";
import { addPending, focPending, pendingTotal, toggleOneFoc } from "../pending";

const beer = { variantId: "v-beer", productId: "p-beer", name: "Beer", unitPrice: 3500 };

describe("pending tray", () => {
  it("makes one of a round free and leaves the rest to pay", () => {
    const tray = toggleOneFoc(addPending([], beer, 3), "v-beer");

    expect(tray).toEqual([
      { ...beer, quantity: 2 },
      { ...beer, quantity: 1, foc: true },
    ]);
    expect(pendingTotal(tray)).toBe(7000);
    expect(focPending(tray)).toHaveLength(1);
  });

  it("moves a free one back to paid, merging the rows", () => {
    const tray = toggleOneFoc(toggleOneFoc(addPending([], beer, 2), "v-beer"), "v-beer:foc");

    expect(tray).toEqual([{ ...beer, quantity: 2 }]);
  });

  it("adds new taps to the paid row, not the free one", () => {
    const tray = addPending(toggleOneFoc(addPending([], beer), "v-beer"), beer);

    expect(tray).toEqual([
      { ...beer, quantity: 1, foc: true },
      { ...beer, quantity: 1 },
    ]);
  });
});
