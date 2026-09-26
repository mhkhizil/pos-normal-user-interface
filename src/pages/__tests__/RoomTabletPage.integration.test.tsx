import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoomTabletPage } from "../RoomTabletPage";

const mocks = vi.hoisted(() => ({
  loadVisit: vi.fn(),
  refreshVisit: vi.fn(),
  loadMenu: vi.fn(),
  loadHistory: vi.fn(),
  placeOrder: vi.fn(),
  addTime: vi.fn(),
  clear: vi.fn(),
}));

const visit = {
  guest: { displayName: "Daw Hla H.", tier: "Black", discountPercent: 15, isPostpaid: true, balance: "-96500.0000" },
  rooms: [
    {
      kind: "SPA",
      sessionId: "session-1",
      roomId: "room-1",
      roomNumber: "S2",
      roomName: "Orchid Room",
      sessionState: "OPEN",
      openedAt: "2026-09-26T07:00:00Z",
      plannedMinutes: 120,
      sessionMinutes: 60,
      sessionPrice: "30000.0000",
      endsAt: "2099-01-01T00:00:00Z",
      prepaid: true,
      spent: "51000.0000",
      orders: [
        { id: "o-1", orderNumber: 1, kind: "ITEMS", source: "TABLET", amount: "5100.0000", placedAt: "", status: "PREPARING", items: [{ name: "Ginger tea", quantity: 1, refunded: false }] },
      ],
    },
  ],
};
const menu = [
  { categoryId: "c-1", name: "Soft Drinks", items: [{ variantId: "v-cola", name: "Coca-Cola", price: "1500.0000", imageUrl: null }] },
];
let state: Record<string, unknown> = {};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("@/core/presentation/hooks/useCardCapture", () => ({
  useCardCapture: () => ({ nfcSupported: false, nfcActive: false, nfcError: null, lastUid: "", startNfc: vi.fn() }),
}));
vi.mock("@/core/presentation/hooks/useRoomTablet", () => ({
  useRoomTablet: () => ({ ...state, isLoading: false, ...mocks }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <RoomTabletPage />
    </MemoryRouter>
  );

const tap = (uid = "04C9D1E7") => {
  fireEvent.change(screen.getByPlaceholderText("tablet.typeCard"), { target: { value: uid } });
  fireEvent.click(screen.getByRole("button", { name: "tablet.ok" }));
};

describe("RoomTabletPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(
      "room-tablet-setup",
      JSON.stringify({ deviceName: "Lounge 1", allowTyping: true })
    );
    state = { visit: null, menu: [], history: [] };
    mocks.loadVisit.mockImplementation(async () => {
      state = { ...state, visit };
      return visit;
    });
    mocks.loadMenu.mockImplementation(async () => {
      state = { ...state, menu };
      return menu;
    });
    mocks.placeOrder.mockResolvedValue({ charged: "1275.0000", balanceAfter: "-97775.0000", orderNumber: 2 });
  });

  it("asks a new tablet for its name first", () => {
    window.localStorage.removeItem("room-tablet-setup");
    renderPage();
    expect(screen.getByText("tablet.setupTitle")).toBeInTheDocument();
  });

  it("shows the tapped card's visit, then orders and pays with a second tap", async () => {
    const view = renderPage();
    tap();
    await waitFor(() => expect(mocks.loadVisit).toHaveBeenCalledWith("04C9D1E7"));
    view.rerender(
      <MemoryRouter>
        <RoomTabletPage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Ginger tea/)).toBeInTheDocument();
    expect(screen.getByText("tablet.status.PREPARING")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tablet.orderFood" }));
    await waitFor(() => expect(mocks.loadMenu).toHaveBeenCalled());
    view.rerender(
      <MemoryRouter>
        <RoomTabletPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /Coca-Cola/ }));
    fireEvent.click(screen.getByRole("button", { name: "tablet.payAndOrder" }));
    tap();

    await waitFor(() =>
      expect(mocks.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          cardUid: "04C9D1E7",
          sessionId: "session-1",
          items: [{ variantId: "v-cola", quantity: 1 }],
          deviceName: "Lounge 1",
        })
      )
    );
    expect(await screen.findByText("tablet.orderSent")).toBeInTheDocument();
  });

  it("explains a card that cannot cover the order", async () => {
    mocks.loadVisit.mockRejectedValue(new Error("Insufficient balance: the card holds 0"));
    renderPage();
    tap();
    expect(await screen.findByText("tablet.errors.balance")).toBeInTheDocument();
  });
});
