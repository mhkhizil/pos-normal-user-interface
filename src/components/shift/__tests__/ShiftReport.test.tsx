import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShiftReport } from "../ShiftReport";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => (options?.name ? `${key}:${options.name}` : key),
  }),
}));

vi.mock("../shiftApi", () => ({ money: (value: number) => String(value) }));

const summary = {
  sessionId: "s",
  registerName: "Till 1",
  cashierName: "Aye Aye",
  openedAt: "2026-11-03T18:00:00",
  closedAt: null,
  openingCashFloat: 0,
  expectedClosingCash: 0,
  actualClosingCash: null,
  cashVariance: null,
  totalSales: 100000,
  totalRefunds: 0,
  netTotal: 100000,
  salesCount: 2,
  refundCount: 0,
  nonSalesCashIn: 0,
  nonSalesCashOut: 0,
  paymentBreakdown: [],
};

describe("ShiftReport", () => {
  it("lists each group with its items and total", () => {
    render(
      <ShiftReport
        summary={{
          ...summary,
          groups: {
            sections: [
              {
                key: "k",
                kind: "STATION",
                name: "Kitchen",
                items: [{ variantId: "v", name: "Fried rice", quantity: 27, amount: 135000 }],
                quantity: 27,
                amount: 135000,
              },
            ],
            rooms: { rows: [{ room: "3", hours: 6.5, amount: 195000 }], hours: 6.5, amount: 195000 },
            takeaway: { orders: 0, amount: 0 },
            credit: { rows: [], amount: 0 },
          },
        }}
      />
    );

    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Fried rice")).toBeInTheDocument();
    expect(screen.getByText("shift.groups.total:Kitchen")).toBeInTheDocument();
    expect(screen.getByText("shift.groups.rooms")).toBeInTheDocument();
    expect(screen.queryByText("shift.groups.takeaway")).toBeNull();
    expect(screen.getByText("shift.groups.note")).toBeInTheDocument();
  });

  it("shows only the totals when the server sent no groups", () => {
    render(<ShiftReport summary={summary} />);
    expect(screen.queryByText("shift.groups.note")).toBeNull();
    expect(screen.getByText("shift.net")).toBeInTheDocument();
  });
});
