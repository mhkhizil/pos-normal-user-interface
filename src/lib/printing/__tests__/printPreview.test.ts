import { afterEach, describe, expect, it } from "vitest";
import type { SaleReceipt } from "../formatKdsTicket";
import { currentPrintPreview, previewBeforePrint, setPrintPreviewOn } from "../printPreview";

const receipt = { title: "RECEIPT", lines: [], total: "1000" } as SaleReceipt;

describe("printPreview", () => {
  afterEach(() => setPrintPreviewOn(false));

  it("prints straight away when the device does not preview", async () => {
    await expect(previewBeforePrint(receipt)).resolves.toBe(true);
    expect(currentPrintPreview()).toBeNull();
  });

  it("waits on the shown slip and prints when asked", async () => {
    setPrintPreviewOn(true);
    const answer = previewBeforePrint(receipt);
    expect(currentPrintPreview()?.receipt).toBe(receipt);
    currentPrintPreview()?.answer(true);
    await expect(answer).resolves.toBe(true);
    expect(currentPrintPreview()).toBeNull();
  });

  it("does not print a cancelled slip, or one a newer slip replaced", async () => {
    setPrintPreviewOn(true);
    const first = previewBeforePrint(receipt);
    const second = previewBeforePrint({ ...receipt, total: "2000" });
    await expect(first).resolves.toBe(false);
    currentPrintPreview()?.answer(false);
    await expect(second).resolves.toBe(false);
  });
});
