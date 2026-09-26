import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "@/components/ui/Toaster";
import { SpaBoardPage } from "../SpaBoardPage";

const mocks = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  getQuote: vi.fn(),
  closeSession: vi.fn(),
  openSession: vi.fn(),
  fetchOrderLines: vi.fn(),
  updateOrderLine: vi.fn(),
  deleteOrderLine: vi.fn(),
  addOrderLine: vi.fn(),
  updateRoom: vi.fn(),
  chargeItems: vi.fn(),
  giveFree: vi.fn(),
  extendSession: vi.fn(),
  refundLine: vi.fn(),
  settleOrder: vi.fn(),
  lookupCard: vi.fn(),
  getWallet: vi.fn(),
  requireCashierContext: vi.fn(),
  noop: vi.fn(),
}));

const wallet = {
  id: "wallet-1",
  tenantId: "tenant-1",
  guestName: "Aung Aung",
  tierNameSnapshot: "Gold",
  discountBpsSnapshot: 500,
  balance: "120000.0000",
  status: "ACTIVE",
};
const card = { id: "card-1", cardUid: "04A3B2C1", walletId: "wallet-1", wallet };

const room = (guestWalletId: string) => ({
  id: "room-1",
  tenantId: "tenant-1",
  locationId: "location-1",
  roomNumber: "SUITE1",
  name: "Couple suite",
  capacity: 2,
  rateVariantId: "variant-rate",
  rateProductId: "product-room",
  sessionPrice: 30000,
  minimumMinutes: 90,
  incrementMinutes: 90,
  graceMinutes: 15,
  roundingMode: "DOWN",
  status: "OCCUPIED",
  sessions: [
    {
      id: "session-1",
      roomId: "room-1",
      guestWalletId,
      salesOrderId: "order-1",
      guestCount: 2,
      openedAt: "2026-09-26T07:00:00Z",
      sessionState: "OPEN",
    },
  ],
});

let quote: Record<string, unknown> = {};
const legacyQuote = {
  sessionId: "session-1",
  roomNumber: "SUITE1",
  segments: [],
  treatmentCharge: "45000.0000",
  servicesCharge: "8000.0000",
  runningTotal: "53000.0000",
};

const scrub = {
  id: "product-scrub",
  tenantId: "tenant-1",
  name: "Foot Scrub",
  categoryName: "Spa Services",
  trackingType: "SERVICE",
  basePrice: "6000.0000",
};
const beer = {
  id: "product-beer",
  tenantId: "tenant-1",
  name: "Myanmar Beer",
  categoryName: "Beer & Spirits",
  trackingType: "STANDARD",
  basePrice: "3500.0000",
};
const roomRate = {
  id: "product-room",
  tenantId: "tenant-1",
  name: "Spa room SUITE1",
  categoryName: "Spa Rooms",
  trackingType: "SERVICE",
  basePrice: "30000.0000",
};
const scrubVariant = { id: "variant-scrub", productId: "product-scrub", priceModifier: "0" };

let rooms = [room("wallet-1")];
let lines: Record<string, unknown>[] = [];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => null,
}));

vi.mock("@/core/presentation/hooks/useSpaManagement", () => ({
  useSpaManagement: () => ({
    rooms,
    quote,
    isLoading: false,
    error: null,
    fetchBoard: mocks.fetchBoard,
    createRoom: mocks.noop,
    updateRoom: mocks.updateRoom,
    deleteRoom: mocks.noop,
    markRoomReady: mocks.noop,
    openSession: mocks.openSession,
    getQuote: mocks.getQuote,
    pauseSession: mocks.noop,
    resumeSession: mocks.noop,
    closeSession: mocks.closeSession,
    chargeItems: mocks.chargeItems,
    giveFree: mocks.giveFree,
    extendSession: mocks.extendSession,
    refundLine: mocks.refundLine,
    clearQuote: mocks.noop,
  }),
}));

vi.mock("@/core/presentation/hooks/useCashier", () => ({
  useCashier: () => ({
    products: [scrub, beer, roomRate],
    variantsByProductId: {
      "product-scrub": [scrubVariant],
      "product-beer": [{ id: "variant-beer", productId: "product-beer", priceModifier: "0" }],
    },
    paymentMethods: [
      { id: "card-method", tenantId: "tenant-1", name: "Guest Card", kind: "GUEST_CARD" },
      { id: "cash-method", tenantId: "tenant-1", name: "Cash", kind: "CASH" },
    ],
    discountReasons: [{ id: "reason-foc", name: "Birthday", isActive: true }],
    fetchDiscountReasons: () => Promise.resolve(),
    fetchProducts: mocks.noop,
    fetchProductVariants: mocks.noop,
    fetchPaymentMethods: mocks.noop,
  }),
}));

vi.mock("@/core/presentation/hooks/useSalesOrderManagement", () => ({
  useSalesOrderManagement: () => ({
    orderLines: lines,
    fetchOrderLines: mocks.fetchOrderLines,
    addOrderLine: mocks.addOrderLine,
    updateOrderLine: mocks.updateOrderLine,
    deleteOrderLine: mocks.deleteOrderLine,
    settleOrder: mocks.settleOrder,
  }),
}));

vi.mock("@/core/presentation/hooks/useGuestWalletManagement", () => ({
  useGuestWalletManagement: () => ({
    lookupCard: mocks.lookupCard,
    getWallet: mocks.getWallet,
  }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({
    activeLocationId: "location-1",
    isWorkspaceReady: true,
    requireCashierContext: mocks.requireCashierContext,
  }),
}));

vi.mock("@/core/presentation/hooks/useCardCapture", () => ({
  useCardCapture: () => ({
    nfcSupported: false,
    nfcActive: false,
    nfcError: null,
    lastUid: "",
    startNfc: vi.fn(),
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/spa"]}>
      <SpaBoardPage />
      <Toaster />
    </MemoryRouter>
  );

const openRunningRoom = async () => {
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: /SUITE1/ }));
  await screen.findByRole("button", { name: "spa.pause" });
};

const tapCard = async (uid = "04A3B2C1") => {
  fireEvent.change(await screen.findByPlaceholderText("spa.cardUid"), {
    target: { value: uid },
  });
  fireEvent.click(screen.getByRole("button", { name: "spa.checkCard" }));
};

describe("SpaBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rooms = [room("wallet-1")];
    lines = [];
    quote = legacyQuote;
    mocks.fetchBoard.mockResolvedValue(rooms);
    mocks.getQuote.mockImplementation(() => Promise.resolve(quote));
    mocks.fetchOrderLines.mockResolvedValue({ lines: [] });
    mocks.addOrderLine.mockResolvedValue({ id: "line-new" });
    mocks.closeSession.mockImplementation(() => Promise.resolve({ ...quote, state: "CLOSED" }));
    mocks.lookupCard.mockResolvedValue(card);
    mocks.getWallet.mockResolvedValue(wallet);
    mocks.requireCashierContext.mockResolvedValue({
      tenantId: "tenant-1",
      locationId: "location-1",
      posRegisterId: "register-1",
      posSessionId: "pos-session-1",
    });
    mocks.settleOrder.mockResolvedValue({
      orderId: "order-1",
      orderNumber: "SO-001",
      grandTotal: "50350.0000",
      totalPaid: "50350.0000",
      change: "0.0000",
      status: "COMPLETED",
    });
  });

  it("opens a running room's bill and menu without asking for a card", async () => {
    await openRunningRoom();

    expect(mocks.getQuote).toHaveBeenCalledWith("session-1");
    expect(screen.getByText("spa.noCardYet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Foot Scrub/ })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("spa.cardUid")).not.toBeInTheDocument();
  });

  it("collects items in the tray, then adds them all after one card tap", async () => {
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
    fireEvent.click(await screen.findByRole("button", { name: "spa.increaseNew" }));
    expect(mocks.addOrderLine).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /spa.addToBill/ }));
    await tapCard();

    await waitFor(() =>
      expect(mocks.addOrderLine).toHaveBeenCalledWith("order-1", {
        variantId: "variant-scrub",
        quantity: "2.0000",
        unitPrice: "6000.0000",
        lineDiscount: "0.0000",
      })
    );
    expect(await screen.findByText("spa.itemsAdded")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("spa.cardUid")).not.toBeInTheDocument();
  });

  it("asks for a card tap for every order", async () => {
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
    fireEvent.click(await screen.findByRole("button", { name: /spa.addToBill/ }));
    await tapCard();
    await waitFor(() => expect(mocks.addOrderLine).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
    fireEvent.click(await screen.findByRole("button", { name: /spa.addToBill/ }));

    expect(await screen.findByPlaceholderText("spa.cardUid")).toBeInTheDocument();
    expect(mocks.addOrderLine).toHaveBeenCalledTimes(1);
    await tapCard();
    await waitFor(() => expect(mocks.addOrderLine).toHaveBeenCalledTimes(2));
    expect(mocks.lookupCard).toHaveBeenCalledTimes(2);
  });

  it("keeps the dialog open for a card that did not open the treatment", async () => {
    rooms = [room("someone-else")];
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
    fireEvent.click(await screen.findByRole("button", { name: /spa.addToBill/ }));
    await tapCard();

    expect(await screen.findByText("spa.errors.wrongSessionCard")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("spa.cardUid")).toBeInTheDocument();
    expect(mocks.addOrderLine).not.toHaveBeenCalled();
  });

  it("closes the treatment, then settles its bill on the card under one key", async () => {
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: "spa.goToPay" }));
    await tapCard();
    fireEvent.click(await screen.findByRole("button", { name: "spa.confirmPay" }));

    await waitFor(() =>
      expect(mocks.settleOrder).toHaveBeenCalledWith("order-1", {
        payments: [{ paymentMethodId: "card-method", guestCardId: "card-1" }],
        posSessionId: "pos-session-1",
        idempotencyKey: "spa-settle-session-1",
      })
    );
    expect(mocks.closeSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.settleOrder.mock.invocationCallOrder[0]
    );
    expect(await screen.findByText("spa.paidTitle")).toBeInTheDocument();
  });

  it("splits the bill with cash when asked", async () => {
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: "spa.goToPay" }));
    await tapCard();
    fireEvent.click(await screen.findByLabelText("spa.splitCash"));
    fireEvent.change(screen.getByLabelText("spa.cashAmount"), {
      target: { value: "20000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "spa.confirmPay" }));

    await waitFor(() =>
      expect(mocks.settleOrder).toHaveBeenCalledWith(
        "order-1",
        expect.objectContaining({
          payments: [
            { paymentMethodId: "cash-method", amount: "20000.0000" },
            { paymentMethodId: "card-method", guestCardId: "card-1" },
          ],
        })
      )
    );
  });

  it("fixes a wrong line without a card by lowering or removing it", async () => {
    lines = [
      {
        id: "line-1",
        salesOrderId: "order-1",
        variantId: "variant-scrub",
        productName: "Foot Scrub",
        quantity: "2.0000",
        unitPrice: "6000.0000",
        status: "PENDING",
      },
    ];
    await openRunningRoom();

    fireEvent.click(screen.getByRole("button", { name: "spa.decrease" }));
    await waitFor(() =>
      expect(mocks.updateOrderLine).toHaveBeenCalledWith("order-1", "line-1", {
        quantity: "1.0000",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "spa.removeLine" }));
    await waitFor(() =>
      expect(mocks.deleteOrderLine).toHaveBeenCalledWith("order-1", "line-1")
    );
    expect(mocks.lookupCard).not.toHaveBeenCalled();
  });

  it("gives items free with a reason and no card tap", async () => {
    mocks.giveFree.mockResolvedValue({ charged: "0", balanceAfter: "120000", quote });
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
    fireEvent.click(await screen.findByRole("button", { name: "spa.focToggle" }));
    fireEvent.click(screen.getByRole("button", { name: "spa.giveFreeCount" }));

    const confirm = screen.getByRole("button", { name: "spa.focConfirm" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("spa.focReason"), {
      target: { value: "Birthday" },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(mocks.giveFree).toHaveBeenCalledWith("session-1", {
        items: [{ variantId: "variant-scrub", quantity: 1 }],
        reason: "Birthday",
      })
    );
    expect(await screen.findByText("spa.focGiven")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("spa.cardUid")).not.toBeInTheDocument();
    expect(mocks.addOrderLine).not.toHaveBeenCalled();
  });

  it("gives one of a round free and asks the card for the rest", async () => {
    mocks.giveFree.mockResolvedValue({ charged: "0", balanceAfter: "120000", quote });
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
    fireEvent.click(await screen.findByRole("button", { name: "spa.increaseNew" }));
    fireEvent.click(screen.getByRole("button", { name: "spa.focToggle" }));
    fireEvent.click(screen.getByRole("button", { name: "spa.addToBillWithFree" }));

    fireEvent.change(screen.getByLabelText("spa.focReason"), {
      target: { value: "Birthday" },
    });
    fireEvent.click(screen.getByRole("button", { name: "spa.focConfirm" }));
    await waitFor(() =>
      expect(mocks.giveFree).toHaveBeenCalledWith("session-1", {
        items: [{ variantId: "variant-scrub", quantity: 1 }],
        reason: "Birthday",
      })
    );

    await tapCard();
    await waitFor(() =>
      expect(mocks.addOrderLine).toHaveBeenCalledWith(
        "order-1",
        expect.objectContaining({ variantId: "variant-scrub", quantity: "1.0000" })
      )
    );
    expect(mocks.addOrderLine).toHaveBeenCalledTimes(1);
  });

  it("marks a free line and lets it only be removed", async () => {
    lines = [
      {
        id: "line-foc",
        salesOrderId: "order-1",
        variantId: "variant-scrub",
        productName: "Foot Scrub",
        quantity: "1.0000",
        unitPrice: "6000.0000",
        lineDiscount: "6000.0000",
        compReasonId: "reason-foc",
        status: "PENDING",
      },
    ];
    await openRunningRoom();

    expect(screen.getByText("spa.foc", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "spa.decrease" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "spa.removeLine" }));
    await waitFor(() =>
      expect(mocks.deleteOrderLine).toHaveBeenCalledWith("order-1", "line-foc")
    );
  });

  it("shows each room's price per session on the board", () => {
    renderPage();
    expect(screen.getByText("30,000")).toBeInTheDocument();
  });

  it("prices a room with a plain number", async () => {
    mocks.updateRoom.mockResolvedValue(room("wallet-1"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "spa.manageRoom" }));

    const price = screen.getByLabelText("spa.sessionPriceLabel");
    expect(price).toHaveValue(30000);
    fireEvent.change(price, { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(mocks.updateRoom).toHaveBeenCalledWith(
        "room-1",
        expect.objectContaining({ sessionPrice: 25000 })
      )
    );
    expect(mocks.updateRoom.mock.calls[0][1]).not.toHaveProperty("rateVariantId");
  });

  it("filters the menu by category, without the room's own price", async () => {
    await openRunningRoom();

    expect(screen.queryByRole("button", { name: /Spa room SUITE1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Spa Services" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Foot Scrub/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Beer & Spirits" }));
    expect(screen.getByRole("button", { name: /Myanmar Beer/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Foot Scrub/ })).not.toBeInTheDocument();
  });

  it("starts a treatment for several sessions after a card tap", async () => {
    rooms = [{ ...room("wallet-1"), status: "AVAILABLE", minimumMinutes: 60, sessions: [] }];
    mocks.openSession.mockResolvedValue({
      id: "session-2",
      roomId: "room-1",
      salesOrderId: "order-2",
      guestWalletId: "wallet-1",
      guestCount: 1,
      openedAt: "2026-09-26T08:00:00Z",
      sessionState: "OPEN",
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /SUITE1/ }));
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "spa.moreSessions" }));
    }
    fireEvent.click(await screen.findByRole("button", { name: "spa.startAndPay" }));
    await tapCard();

    await waitFor(() => expect(mocks.openSession).toHaveBeenCalled());
    expect(mocks.openSession.mock.calls[0][0]).not.toHaveProperty("items");
    await waitFor(() =>
      expect(mocks.openSession).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: "room-1",
          guestWalletId: "wallet-1",
          sessions: 5,
          prepay: expect.objectContaining({
            guestCardId: "card-1",
            paymentMethodId: "card-method",
            posSessionId: "pos-session-1",
          }),
        })
      )
    );
  });

  describe("paid as it goes", () => {
    const charged = (amount: string, balance: string) => ({
      charged: amount,
      balanceAfter: balance,
      quote: { ...quote },
    });

    beforeEach(() => {
      quote = { ...legacyQuote, prepaid: true, paidTotal: "45000.0000" };
      mocks.chargeItems.mockResolvedValue(charged("10200.0000", "109800.0000"));
      mocks.extendSession.mockResolvedValue(charged("51000.0000", "69000.0000"));
      mocks.refundLine.mockResolvedValue(charged("-5100.0000", "114900.0000"));
    });

    it("charges the tray to the card in one go", async () => {
      await openRunningRoom();
      fireEvent.click(screen.getByRole("button", { name: /Foot Scrub/ }));
      fireEvent.click(await screen.findByRole("button", { name: "spa.increaseNew" }));
      fireEvent.click(screen.getByRole("button", { name: /spa.addToBill/ }));
      await tapCard();

      await waitFor(() =>
        expect(mocks.chargeItems).toHaveBeenCalledWith(
          "session-1",
          expect.objectContaining({
            guestCardId: "card-1",
            paymentMethodId: "card-method",
            items: [{ variantId: "variant-scrub", quantity: 2 }],
          })
        )
      );
      expect(mocks.addOrderLine).not.toHaveBeenCalled();
      expect(await screen.findByText("spa.charged")).toBeInTheDocument();
    });

    it("extends by buying more sessions with a tap", async () => {
      await openRunningRoom();
      fireEvent.click(screen.getByRole("button", { name: "spa.extend" }));
      fireEvent.click(screen.getByRole("button", { name: "spa.moreSessions" }));
      fireEvent.click(screen.getByRole("button", { name: "spa.extendAndPay" }));
      await tapCard();

      await waitFor(() =>
        expect(mocks.extendSession).toHaveBeenCalledWith(
          "session-1",
          expect.objectContaining({ sessions: 2, guestCardId: "card-1" })
        )
      );
    });

    it("refunds a wrong item to the card without asking for it", async () => {
      lines = [
        {
          id: "line-1",
          salesOrderId: "order-1",
          variantId: "variant-scrub",
          productName: "Foot Scrub",
          quantity: "1.0000",
          unitPrice: "6000.0000",
          lineDiscount: "900.0000",
          status: "PENDING",
        },
      ];
      await openRunningRoom();
      fireEvent.click(screen.getByRole("button", { name: "spa.refundLine" }));

      await waitFor(() =>
        expect(mocks.refundLine).toHaveBeenCalledWith("session-1", "line-1")
      );
      expect(mocks.lookupCard).not.toHaveBeenCalled();
    });

    it("ends the treatment without taking another payment", async () => {
      await openRunningRoom();
      fireEvent.click(screen.getByRole("button", { name: "spa.endTreatment" }));
      const dialog = await screen.findByText("spa.endTitle");
      expect(dialog).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole("button", { name: "spa.endTreatment" }).at(-1)!);

      await waitFor(() => expect(mocks.closeSession).toHaveBeenCalledWith("session-1", {}));
      expect(mocks.settleOrder).not.toHaveBeenCalled();
      expect(mocks.lookupCard).not.toHaveBeenCalled();
    });
  });
});
