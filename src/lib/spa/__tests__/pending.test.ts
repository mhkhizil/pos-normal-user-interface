import { describe, expect, it } from "vitest";
import {
  addPending,
  focPending,
  pendingKey,
  pendingOrderItems,
  pendingTotal,
  setOrderedBy,
  setPendingNote,
  toggleOneFoc,
} from "../pending";

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

  it("keeps one row per hostess for the same service", () => {
    const hostess = { variantId: "v-hostess", productId: "p-hostess", name: "Hostess", unitPrice: 20000 };
    const tray = addPending(
      addPending(addPending([], { ...hostess, hostessId: "snow", hostessName: "Snow" }), {
        ...hostess,
        hostessId: "rose",
        hostessName: "Rose",
      }),
      { ...hostess, hostessId: "snow", hostessName: "Snow" }
    );

    expect(tray.map((item) => [pendingKey(item), item.quantity])).toEqual([
      ["v-hostess:snow", 2],
      ["v-hostess:rose", 1],
    ]);
    expect(pendingOrderItems(tray)).toEqual([
      { variantId: "v-hostess", quantity: 2, hostessId: "snow" },
      { variantId: "v-hostess", quantity: 1, hostessId: "rose" },
    ]);
  });

  it("sends no hostess for ordinary items", () => {
    expect(pendingOrderItems(addPending([], beer, 2))).toEqual([{ variantId: "v-beer", quantity: 2 }]);
  });
});

describe("setOrderedBy", () => {
  const snow = { id: "h-snow", name: "Snow" };

  it("puts the hostess who ordered on a row, and merges it with her other row", () => {
    const tray = addPending(addPending([], beer, 2), { ...beer, hostessId: "h-snow", hostessName: "Snow" });
    const next = setOrderedBy(tray, pendingKey(tray[0]), snow);
    expect(next).toEqual([{ ...beer, hostessId: "h-snow", hostessName: "Snow", quantity: 3 }]);
    expect(pendingOrderItems(next)).toEqual([{ variantId: "v-beer", quantity: 3, hostessId: "h-snow" }]);
  });

  it("back to the customer, and never on a hostess service", () => {
    const ordered = setOrderedBy(addPending([], beer), pendingKey({ ...beer }), snow);
    expect(setOrderedBy(ordered, pendingKey(ordered[0]))[0].hostessId).toBeUndefined();
    const service = [{ ...beer, quantity: 1, hostessId: "h-rose", service: true }];
    expect(setOrderedBy(service, pendingKey(service[0]), snow)).toBe(service);
  });

  it("keeps the same item with other options or another note on rows of its own", () => {
    const egg = [{ modifierId: "egg", name: "Egg", priceDelta: "500" }];
    const tray = addPending(
      addPending(addPending([], beer), { ...beer, note: "No ice" }),
      { ...beer, modifiers: egg, unitPrice: 4000 }
    );

    expect(tray.map((item) => item.quantity)).toEqual([1, 1, 1]);
    expect(pendingOrderItems(tray)).toEqual([
      { variantId: "v-beer", quantity: 1 },
      { variantId: "v-beer", quantity: 1, note: "No ice" },
      { variantId: "v-beer", quantity: 1, selectedModifiers: [{ modifierId: "egg" }] },
    ]);
  });

  it("merges a row into its twin once they get the same note", () => {
    const tray = addPending(addPending([], beer, 2), { ...beer, note: "No ice" });

    const noted = setPendingNote(tray, pendingKey(tray[0]), "No ice");

    expect(noted).toEqual([{ ...beer, note: "No ice", quantity: 3 }]);
    expect(setPendingNote(noted, pendingKey(noted[0]))).toEqual([{ ...beer, quantity: 3 }]);
  });
});
