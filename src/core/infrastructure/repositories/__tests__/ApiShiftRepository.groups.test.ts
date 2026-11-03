import { describe, expect, it } from "vitest";
import { toSalesGroups } from "../ApiShiftRepository";

describe("toSalesGroups", () => {
  it("reads the server's money strings as numbers", () => {
    const groups = toSalesGroups({
      data: {
        sections: [
          {
            key: "k",
            kind: "STATION",
            name: "Bar",
            items: [{ variantId: "v", name: "Tiger", quantity: "48.0000", amount: "288000.0000" }],
            quantity: "48.0000",
            amount: "288000.0000",
          },
          { key: "x", kind: "WHATEVER", name: null, items: [], quantity: "0", amount: "0" },
        ],
        rooms: { rows: [{ room: "3", hours: "6.50", amount: "195000.0000" }], hours: "6.50", amount: "195000.0000" },
        takeaway: { orders: 3, amount: "42000.0000" },
        credit: { rows: [], amount: "0.0000" },
      },
    });

    expect(groups.sections[0].items[0]).toEqual({ variantId: "v", name: "Tiger", quantity: 48, amount: 288000 });
    expect(groups.sections[1].kind).toBe("OTHER");
    expect(groups.rooms.hours).toBe(6.5);
    expect(groups.takeaway).toEqual({ orders: 3, amount: 42000 });
  });
});
