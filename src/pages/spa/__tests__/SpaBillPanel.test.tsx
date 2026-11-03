import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { SpaRoom, SpaSession, SpaSessionQuote } from "@/core/domain/entities/Spa";
import { SpaBillPanel } from "../SpaBillPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { exists: () => false },
  }),
}));

const room = new SpaRoom({
  id: "room-102",
  roomNumber: "102",
  name: "VIP 102",
  minimumMinutes: 60,
  status: "OCCUPIED",
});
const session = new SpaSession({
  id: "session-1",
  roomId: "room-102",
  salesOrderId: "order-1",
  guestCount: 1,
  openedAt: "2026-10-30T12:16:00.000Z",
  plannedMinutes: 60,
  sessionState: "OPEN",
});
const quote = new SpaSessionQuote({
  sessionId: "session-1",
  roomId: "room-102",
  roomNumber: "102",
  state: "OPEN",
  openedAt: "2026-10-30T12:16:00.000Z",
  asOf: "2026-10-30T13:15:00.000Z",
  elapsedMinutes: 59,
  pausedMinutes: 0,
  treatmentCharge: "40000.0000",
  servicesCharge: "75000.0000",
  runningTotal: "115000.0000",
  prepaid: false,
  paidTotal: "0.0000",
  paymentTiming: "PAY_AT_END",
});

const renderPanel = (overrides: Record<string, unknown> = {}) => {
  const onOpenBill = vi.fn();
  const onTogglePause = vi.fn();
  const onExtend = vi.fn();
  const onPrimary = vi.fn();
  render(
    <SpaBillPanel
      kind="ktv"
      room={room}
      session={session}
      card={null}
      wallet={null}
      quote={quote}
      lines={[]}
      itemNames={{}}
      nowMs={new Date("2026-10-30T13:15:00.000Z").getTime()}
      isBusy={false}
      billClosed={false}
      primaryLabel="spa.pay"
      onPrimary={onPrimary}
      onTogglePause={onTogglePause}
      onOpenBill={onOpenBill}
      onChangeQuantity={vi.fn()}
      onAddAnother={vi.fn()}
      onRemoveLine={vi.fn()}
      pending={[]}
      onPendingChange={vi.fn()}
      onClearPending={vi.fn()}
      onCommitPending={vi.fn()}
      onToggleFoc={vi.fn()}
      onChangeCard={vi.fn()}
      onExtend={onExtend}
      {...overrides}
    />
  );
  return { onOpenBill, onTogglePause, onExtend, onPrimary };
};

/** Opens every bill row, as tapping each one does. */
const openRows = () =>
  screen
    .getAllByRole("button", { name: "cashier.orderPanel.lineDetails" })
    .forEach((row) => fireEvent.click(row));

describe("SpaBillPanel actions", () => {
  it("puts Bill & table beside Extend and the close button, without Pause", () => {
    const { onOpenBill, onExtend, onPrimary } = renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.billOptions.titleWithTable" })
    );
    expect(onOpenBill).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole("button", { name: "spa.pause" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "spa.extend" }));
    expect(onExtend).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "spa.pay" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("keeps the old row when the bill cannot be adjusted", () => {
    renderPanel({ onOpenBill: undefined });

    expect(
      screen.queryByRole("button", { name: "cashier.billOptions.titleWithTable" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "spa.extend" })).toBeInTheDocument();
  });

  it("still restarts a room paused before Pause was taken away", () => {
    const { onTogglePause } = renderPanel({
      session: new SpaSession({ ...session, sessionState: "PAUSED" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "spa.resume" }));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("hides the action row once the bill is closed", () => {
    renderPanel({ billClosed: true });

    expect(
      screen.queryByRole("button", { name: "cashier.billOptions.titleWithTable" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("spa.billClosed")).toBeInTheDocument();
  });

  it("keeps the note for the kitchen in sight once the item is sent", () => {
    renderPanel({
      lines: [
        new SalesOrderLine({
          id: "line-1",
          salesOrderId: "order-1",
          variantId: "variant-soda",
          productName: "Soda",
          quantity: "1.0000",
          unitPrice: "2000.0000",
          note: "No ice",
        }),
      ],
    });

    // The row is not opened: the note shows on it all the same.
    expect(screen.getByText("* No ice")).toBeInTheDocument();
  });

  it("shows a copy the promotion gave away at 0", () => {
    const promoLine = (id: string, lineDiscount: string) =>
      new SalesOrderLine({
        id,
        salesOrderId: "order-1",
        variantId: "variant-scrub",
        productName: "Foot Scrub",
        quantity: "1.0000",
        unitPrice: "6000.0000",
        lineDiscount,
        appliedPromotionId: "promo-1",
      });
    const money = (value: number) =>
      value.toLocaleString(undefined, { maximumFractionDigits: 2 });

    renderPanel({
      lines: [promoLine("line-1", "600.0000"), promoLine("line-2", "6000.0000")],
      promotionName: (id?: string) => (id === "promo-1" ? "Buy 1 Get 1" : undefined),
    });

    openRows();
    // The charged copy reads what the promotion leaves, the free copy reads 0.
    expect(
      screen.getByText(new RegExp(`^@ ${money(5400)} · Buy 1 Get 1$`))
    ).toBeInTheDocument();
    expect(screen.getByText(/^@ 0 · Buy 1 Get 1$/)).toBeInTheDocument();
  });

  it("shows every rate the room sells as room time, with no stepper", () => {
    const roomRate = (id: string, over: Record<string, string>) =>
      new SalesOrderLine({
        id,
        salesOrderId: "order-1",
        quantity: "1.0000",
        unitPrice: "20000.0000",
        ...over,
      });

    renderPanel({
      room: new SpaRoom({
        id: "room-102",
        roomNumber: "102",
        name: "VIP 102",
        minimumMinutes: 60,
        status: "OCCUPIED",
        rateVariantId: "variant-hour",
        sessionPrice: "40000.0000",
      }),
      rentalVariantIds: new Set(["variant-hour", "variant-half"]),
      lines: [
        roomRate("line-hour", { variantId: "variant-hour", quantity: "2.0000", unitPrice: "40000.0000" }),
        roomRate("line-half", { variantId: "variant-half" }),
        roomRate("line-beer", {
          variantId: "variant-beer",
          productName: "Myanmar Beer",
          unitPrice: "4000.0000",
        }),
      ],
    });

    // Both rates read as room time, and neither can be changed from the bill.
    expect(screen.getAllByText("spa.treatmentCharge")).toHaveLength(2);
    expect(screen.getAllByText("1×")).toHaveLength(2);
    expect(screen.getByText("2×")).toBeInTheDocument();
    openRows();
    // Only the menu line keeps its − / + and its remove button.
    expect(screen.getAllByRole("button", { name: "spa.decrease" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "spa.increase" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "spa.removeLine" })).toHaveLength(1);
  });

  it("shows the room session a free-time promotion gave away at 0", () => {
    const hour = (id: string, lineDiscount: string) =>
      new SalesOrderLine({
        id,
        salesOrderId: "order-1",
        variantId: "variant-hour",
        quantity: "1.0000",
        unitPrice: "40000.0000",
        lineDiscount,
        appliedPromotionId: "bogo-hours",
      });
    const money = (value: number) =>
      value.toLocaleString(undefined, { maximumFractionDigits: 2 });

    renderPanel({
      room: new SpaRoom({
        id: "room-102",
        roomNumber: "102",
        name: "VIP 102",
        minimumMinutes: 60,
        status: "OCCUPIED",
        rateVariantId: "variant-hour",
        sessionPrice: "40000.0000",
      }),
      lines: [hour("line-1", "0.0000"), hour("line-2", "40000.0000")],
      promotionName: (id?: string) =>
        id === "bogo-hours" ? "1 hour + 1 free" : undefined,
    });

    // The hour bought at the rate, then the hour the promotion gave away.
    expect(screen.getAllByText("spa.treatmentCharge")).toHaveLength(2);
    openRows();
    expect(
      screen.getByText(new RegExp(`^@ ${money(40000)} · 1 hour \\+ 1 free$`))
    ).toBeInTheDocument();
    expect(screen.getByText(/^@ 0 · 1 hour \+ 1 free$/)).toBeInTheDocument();
  });

  it("lets every row of a bill paid at the end be edited, room time too, and marks a changed price", () => {
    const onEditLine = vi.fn();
    renderPanel({
      room: new SpaRoom({
        id: "room-102",
        roomNumber: "102",
        name: "VIP 102",
        minimumMinutes: 60,
        status: "OCCUPIED",
        rateVariantId: "variant-hour",
        sessionPrice: "40000.0000",
      }),
      rentalVariantIds: new Set(["variant-hour"]),
      lines: [
        new SalesOrderLine({
          id: "line-hour",
          salesOrderId: "order-1",
          variantId: "variant-hour",
          quantity: "2.0000",
          unitPrice: "35000.0000",
        }),
        new SalesOrderLine({
          id: "line-beer",
          salesOrderId: "order-1",
          variantId: "variant-beer",
          productName: "Myanmar Beer",
          quantity: "1.0000",
          unitPrice: "3000.0000",
        }),
      ],
      menuPrice: (line: SalesOrderLine) => (line.variantId === "variant-beer" ? 4000 : undefined),
      onEditLine,
    });
    openRows();

    const edits = screen.getAllByRole("button", { name: "cashier.orderPanel.editItem" });
    expect(edits).toHaveLength(2);
    expect(screen.getByText("cashier.orderPanel.priceNote.discount")).toBeInTheDocument();
    fireEvent.click(edits[0]);
    expect(onEditLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 2, lines: [expect.objectContaining({ id: "line-hour" })] })
    );
  });

  it("keeps the time a promotion gave free out of Edit item", () => {
    renderPanel({
      room: new SpaRoom({
        id: "room-102",
        roomNumber: "102",
        name: "VIP 102",
        minimumMinutes: 60,
        status: "OCCUPIED",
        rateVariantId: "variant-hour",
        sessionPrice: "40000.0000",
      }),
      lines: [
        new SalesOrderLine({
          id: "line-free",
          salesOrderId: "order-1",
          variantId: "variant-hour",
          quantity: "1.0000",
          unitPrice: "40000.0000",
          lineDiscount: "40000.0000",
          appliedPromotionId: "bogo-hours",
        }),
      ],
      onEditLine: vi.fn(),
    });
    openRows();

    expect(screen.queryByRole("button", { name: "cashier.orderPanel.editItem" })).toBeNull();
  });
});
