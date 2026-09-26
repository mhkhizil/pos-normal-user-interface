import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KdsPage } from "../KdsPage";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  start: vi.fn(),
  ready: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/core/presentation/hooks/useKdsBoard", () => ({
  useKdsBoard: () => ({
    tickets: [
      {
        id: "t-1",
        salesOrderId: "order-1",
        ticketNumber: "KDS-1",
        status: "PENDING",
        firedAt: new Date().toISOString(),
        kdsTicketLines: [{ id: "l-1", productName: "Ginger tea", quantity: "2.0000" }],
      },
    ],
    error: null,
    ...mocks,
  }),
}));
vi.mock("@/core/presentation/hooks/useKdsStationManagement", () => ({
  useKdsStationManagement: () => ({ stations: [], listStations: vi.fn() }),
}));
vi.mock("@/core/presentation/hooks/useSpaManagement", () => ({
  useSpaManagement: () => ({
    rooms: [{ roomNumber: "S2", sessions: [{ salesOrderId: "order-1" }] }],
    fetchBoard: vi.fn().mockResolvedValue([]),
  }),
}));

describe("KdsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a spa ticket with its room, and starts and readies it", async () => {
    render(
      <MemoryRouter>
        <KdsPage />
      </MemoryRouter>
    );
    expect(screen.getByText("kds.room")).toBeInTheDocument();
    expect(screen.getByText("Ginger tea")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "kds.start" }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("t-1"));
    fireEvent.click(screen.getByRole("button", { name: "kds.ready" }));
    await waitFor(() => expect(mocks.ready).toHaveBeenCalledWith("t-1"));
  });
});
