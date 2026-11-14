import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTableOrderIds,
  countTableOrders,
  mergeTableOrderIds,
  readTableOrderIds,
  writeTableOrderIds,
} from "../multiOrdering";

describe("multiOrdering", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores unique order IDs per table", () => {
    writeTableOrderIds("table-1", ["order-1", "order-2", "order-1"]);

    expect(readTableOrderIds("table-1")).toEqual(["order-1", "order-2"]);
  });

  it("merges additional IDs while preserving the primary order", () => {
    writeTableOrderIds("table-1", ["order-1", "order-2"]);

    expect(
      mergeTableOrderIds("table-1", "order-1", ["order-3", "order-2"])
    ).toEqual(["order-1", "order-2", "order-3"]);
  });

  it("starts the table's list again when it belongs to earlier guests", () => {
    writeTableOrderIds("table-1", ["order-paid", "order-paid-extra"]);

    expect(mergeTableOrderIds("table-1", "order-new")).toEqual(["order-new"]);
    expect(readTableOrderIds("table-1")).toEqual(["order-new"]);
  });

  it("counts a table's orders from the server's open order", () => {
    expect(countTableOrders(["order-1", "order-2"], undefined)).toBe(0);
    expect(countTableOrders(["order-1", "order-2"], "order-1")).toBe(2);
    expect(countTableOrders(["order-old", "order-2"], "order-new")).toBe(1);
    expect(countTableOrders([], "order-new")).toBe(1);
    expect(
      countTableOrders(["order-1", "order-paid"], "order-1", new Set(["order-paid"]))
    ).toBe(1);
  });

  it("leaves out orders whose table session has closed", () => {
    writeTableOrderIds("table-1", ["order-1", "order-paid", "order-2"]);

    expect(
      mergeTableOrderIds("table-1", "order-1", [], new Set(["order-paid"]))
    ).toEqual(["order-1", "order-2"]);
  });

  it("clears only the requested table", () => {
    writeTableOrderIds("table-1", ["order-1"]);
    writeTableOrderIds("table-2", ["order-2"]);

    clearTableOrderIds("table-1");

    expect(readTableOrderIds("table-1")).toEqual([]);
    expect(readTableOrderIds("table-2")).toEqual(["order-2"]);
  });
});
