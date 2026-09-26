import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoomTabletPage } from "../RoomTabletPage";

const mocks = vi.hoisted(() => ({
  loadVisit: vi.fn(),
  refreshVisit: vi.fn(),
  loadMenu: vi.fn(),
  loadHistory: vi.fn(),
  loadRooms: vi.fn(),
  startRoom: vi.fn(),
  placeOrder: vi.fn(),
  addTime: vi.fn(),
  clear: vi.fn(),
}));

const freeRoom = {
  roomId: "room-2",
  roomNumber: "S2",
  name: "Orchid Room",
  treatment: "Aroma Massage 60 min",
  sessionMinutes: 60,
  sessionPrice: "30000.0000",
  status: "AVAILABLE",
  available: true,
  endsAt: null,
};
const busyRoom = { ...freeRoom, status: "IN_USE", available: false, endsAt: "2099-01-01T00:00:00Z" };

const visit = {
  guest: { displayName: "Daw Hla H.", tier: "Black", discountPercent: 15, isPostpaid: true, balance: "-96500.0000" },
  rooms: [
    {
      kind: "SPA",
      sessionId: "session-1",
      roomId: "room-2",
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
        { id: "o-1", orderNumber: 2, kind: "ITEMS", source: "TABLET", amount: "5100.0000", placedAt: "", status: "PREPARING", items: [{ name: "Ginger tea", quantity: 1, refunded: false }] },
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

const page = (
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
    window.localStorage.setItem("room-tablet-room", JSON.stringify({ roomId: "room-2", roomNumber: "S2" }));
    state = { visit: null, menu, history: [], rooms: [freeRoom] };
    mocks.loadRooms.mockResolvedValue([freeRoom]);
    mocks.loadMenu.mockResolvedValue(menu);
    mocks.loadVisit.mockImplementation(async () => {
      state = { ...state, visit };
      return visit;
    });
    mocks.startRoom.mockResolvedValue({ sessionId: "session-1", charged: "52275.0000", balanceAfter: "-148775.0000" });
  });

  it("is linked to its room once, by picking it", () => {
    window.localStorage.removeItem("room-tablet-room");
    render(page);
    fireEvent.click(screen.getByRole("button", { name: /S2/ }));
    expect(JSON.parse(window.localStorage.getItem("room-tablet-room") || "{}")).toEqual({
      roomId: "room-2",
      roomNumber: "S2",
    });
  });

  it("takes a free room: sessions and food, paid by one tap", async () => {
    render(page);
    fireEvent.click(screen.getByRole("button", { name: "tablet.startTreatment" }));
    fireEvent.click(screen.getAllByRole("button", { name: "tablet.more" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Coca-Cola/ }));
    fireEvent.click(screen.getByRole("button", { name: "tablet.payAndStart" }));
    tap();

    await waitFor(() =>
      expect(mocks.startRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          cardUid: "04C9D1E7",
          roomId: "room-2",
          sessions: 2,
          items: [{ variantId: "v-cola", quantity: 1 }],
          deviceName: "S2 tablet",
        })
      )
    );
    expect(await screen.findByText("tablet.started")).toBeInTheDocument();
  });

  it("opens the visit of the card that took the room", async () => {
    state = { ...state, rooms: [busyRoom] };
    const view = render(page);
    tap();
    await waitFor(() => expect(mocks.loadVisit).toHaveBeenCalledWith("04C9D1E7"));
    view.rerender(page);
    expect(await screen.findByText(/Ginger tea/)).toBeInTheDocument();
    expect(screen.getByText("tablet.status.PREPARING")).toBeInTheDocument();
  });

  it("refuses a card that did not take this room", async () => {
    state = { ...state, rooms: [busyRoom] };
    mocks.loadVisit.mockResolvedValue({ ...visit, rooms: [] });
    render(page);
    tap("OTHER");
    expect(await screen.findByText("tablet.errors.wrongCard")).toBeInTheDocument();
  });
});
