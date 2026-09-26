import { describe, expect, it } from "vitest";
import { buildSpaSettlePayments, estimateCardCharge } from "../payment";
import { spaSettleKey, treatmentLengthOptions } from "../session";
import { SpaRoom } from "@/core/domain/entities/Spa";

describe("spa payment", () => {
  it("estimates the card charge after the member discount, tip and cash", () => {
    expect(estimateCardCharge({ runningTotal: "61500", discountBps: 500 })).toBe(58425);
    expect(
      estimateCardCharge({ runningTotal: "61500", discountBps: 500, tip: 2000, cash: 10000 })
    ).toBe(50425);
    expect(estimateCardCharge({ runningTotal: "1000", cash: 5000 })).toBe(0);
  });

  it("lets the server charge the card whatever the cash leaves", () => {
    expect(
      buildSpaSettlePayments({
        cardMethodId: "card-method",
        guestCardId: "card-1",
        cashMethodId: "cash-method",
        cashAmount: 20000,
      })
    ).toEqual([
      { paymentMethodId: "cash-method", amount: "20000.0000" },
      { paymentMethodId: "card-method", guestCardId: "card-1" },
    ]);
    expect(
      buildSpaSettlePayments({ cardMethodId: "card-method", guestCardId: "card-1" })
    ).toEqual([{ paymentMethodId: "card-method", guestCardId: "card-1" }]);
  });

  it("refuses cash when no cash method exists", () => {
    expect(() =>
      buildSpaSettlePayments({ cardMethodId: "m", guestCardId: "c", cashAmount: 100 })
    ).toThrow();
  });

  it("settles each treatment under one key", () => {
    expect(spaSettleKey("session-1")).toBe(spaSettleKey("session-1"));
  });

  it("offers the room's treatment length and back-to-back multiples", () => {
    expect(treatmentLengthOptions(new SpaRoom({ minimumMinutes: 90 }))).toEqual([90, 180, 270]);
  });
});
