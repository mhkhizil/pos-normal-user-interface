import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SpaBoardPage } from "../SpaBoardPage";

const mocks = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  getQuote: vi.fn(),
  closeSession: vi.fn(),
  openSession: vi.fn(),
  fetchOrderLines: vi.fn(),
  updateOrderLine: vi.fn(),
  deleteOrderLine: vi.fn(),
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

const quote = {
  sessionId: "session-1",
  roomNumber: "SUITE1",
  segments: [],
  treatmentCharge: "45000.0000",
  servicesCharge: "8000.0000",
  runningTotal: "53000.0000",
};

let rooms = [room("wallet-1")];
let lines: Record<string, unknown>[] = [];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/core/presentation/hooks/useSpaManagement", () => ({
  useSpaManagement: () => ({
    rooms,
    quote,
    isLoading: false,
    error: null,
    fetchBoard: mocks.fetchBoard,
    createRoom: mocks.noop,
    updateRoom: mocks.noop,
    deleteRoom: mocks.noop,
    markRoomReady: mocks.noop,
    openSession: mocks.openSession,
    getQuote: mocks.getQuote,
    pauseSession: mocks.noop,
    resumeSession: mocks.noop,
    closeSession: mocks.closeSession,
    clearQuote: mocks.noop,
  }),
}));

vi.mock("@/core/presentation/hooks/useCashier", () => ({
  useCashier: () => ({
    products: [],
    variantsByProductId: {},
    paymentMethods: [
      { id: "card-method", tenantId: "tenant-1", name: "Guest Card", kind: "GUEST_CARD" },
      { id: "cash-method", tenantId: "tenant-1", name: "Cash", kind: "CASH" },
    ],
    fetchProducts: mocks.noop,
    fetchProductVariants: mocks.noop,
    fetchPaymentMethods: mocks.noop,
  }),
}));

vi.mock("@/core/presentation/hooks/useSalesOrderManagement", () => ({
  useSalesOrderManagement: () => ({
    orderLines: lines,
    fetchOrderLines: mocks.fetchOrderLines,
    addOrderLine: mocks.noop,
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
    </MemoryRouter>
  );

const openRunningRoom = async () => {
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: /SUITE1/ }));
  await screen.findByRole("button", { name: "spa.goToPay" });
};

const tapCard = async (uid = "04A3B2C1") => {
  fireEvent.change(screen.getByPlaceholderText("spa.cardUid"), {
    target: { value: uid },
  });
  fireEvent.click(screen.getByRole("button", { name: "spa.checkCard" }));
  fireEvent.click(await screen.findByRole("button", { name: "spa.continue" }));
};

const openRoomAndTapCardToPay = async () => {
  await openRunningRoom();
  fireEvent.click(screen.getByRole("button", { name: "spa.goToPay" }));
  await tapCard();
  await screen.findByRole("button", { name: "spa.confirmPay" });
};

describe("SpaBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rooms = [room("wallet-1")];
    lines = [];
    mocks.fetchBoard.mockResolvedValue(rooms);
    mocks.getQuote.mockResolvedValue(quote);
    mocks.fetchOrderLines.mockResolvedValue({ lines: [] });
    mocks.closeSession.mockResolvedValue({ ...quote, state: "CLOSED" });
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

  it("closes the treatment, then settles its bill on the card under one key", async () => {
    await openRoomAndTapCardToPay();
    fireEvent.click(screen.getByRole("button", { name: "spa.confirmPay" }));

    await waitFor(() =>
      expect(mocks.settleOrder).toHaveBeenCalledWith("order-1", {
        payments: [{ paymentMethodId: "card-method", guestCardId: "card-1" }],
        posSessionId: "pos-session-1",
        idempotencyKey: "spa-settle-session-1",
      })
    );
    expect(mocks.closeSession).toHaveBeenCalledWith("session-1", {});
    expect(mocks.closeSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.settleOrder.mock.invocationCallOrder[0]
    );
    expect(await screen.findByText("spa.paidTitle")).toBeInTheDocument();
  });

  it("splits the bill with cash when asked", async () => {
    await openRoomAndTapCardToPay();
    fireEvent.click(screen.getByLabelText("spa.splitCash"));
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

  it("refuses a card that did not open the treatment", async () => {
    rooms = [room("someone-else")];
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: "spa.goToPay" }));
    await tapCard();

    expect(await screen.findByText("spa.errors.wrongSessionCard")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "spa.confirmPay" })).not.toBeInTheDocument();
  });

  it("lets staff open a running room and see its bill without a card", async () => {
    await openRunningRoom();

    expect(mocks.getQuote).toHaveBeenCalledWith("session-1");
    expect(screen.queryByPlaceholderText("spa.cardUid")).not.toBeInTheDocument();
    expect(screen.getByText("spa.cardNeededToAdd")).toBeInTheDocument();
  });

  it("asks for the card before adding services", async () => {
    await openRunningRoom();
    fireEvent.click(screen.getByRole("button", { name: "spa.tapCard" }));

    expect(await screen.findByText("spa.cardFor.menu")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("spa.cardUid")).toBeInTheDocument();
  });

  it("fixes a wrong tap by lowering the quantity or removing the item", async () => {
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

    expect(await screen.findByText("Foot Scrub")).toBeInTheDocument();
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
  });
});
