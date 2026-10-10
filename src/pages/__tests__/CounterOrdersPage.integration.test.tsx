import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CounterOrdersPage } from "../CounterOrdersPage";

const ticket = {
  id: "ticket-9",
  ticketNumber: "KDS-9",
  status: "PENDING",
  courseType: "MAIN",
  firedAt: "2026-09-22T16:53:22.241Z",
  salesOrderId: "order-9",
  stationId: "station-kitchen",
};

const mocks = vi.hoisted(() => ({
  listTickets: vi.fn(),
  getTicket: vi.fn(),
  printTicket: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "counterOrders.printTicket") return `Print ${values?.ticket}`;
      if (key === "counterOrders.queues.printJob") return `Print job (${values?.count})`;
      if (key === "counterOrders.pageLabel") {
        return `Page ${values?.page} / ${values?.pages}`;
      }
      const labels: Record<string, string> = {
        "counterOrders.queues.pending": "Waiting",
        "counterOrders.queues.preparing": "Preparing",
        "counterOrders.queues.ready": "Ready",
        "counterOrders.queues.expedited": "Expedited",
        "counterOrders.allStations": "All stations",
        "counterOrders.statuses.pending": "Pending",
        "counterOrders.refresh": "Refresh tickets",
        "counterOrders.details": "Details",
        "counterOrders.closeDetails": "Close",
        "counterOrders.noLines": "No returned order lines.",
        "common.loading": "Loading",
        "counterOrders.noTickets": "No KDS tickets returned.",
      };
      return labels[key] || key;
    },
  }),
}));

vi.mock("@/core/presentation/hooks/useCashier", () => ({
  useCashier: () => ({
    isLoading: false,
    error: null,
    listKdsTickets: mocks.listTickets,
    getKdsTicketById: mocks.getTicket,
  }),
}));

vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({ user: { tenantId: "tenant-1" } }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({
    activePosRegisterId: "register-1",
    activeLocationId: "location-1",
  }),
}));

vi.mock("@/core/presentation/hooks/useKdsStationManagement", () => ({
  useKdsStationManagement: () => ({
    stations: [
      {
        id: "station-kitchen",
        name: "Kitchen",
        printerIds: ["printer-1"],
        routingRules: { categoryIds: ["snack"] },
      },
    ],
    listStations: vi.fn().mockResolvedValue({
      stations: [
        {
          id: "station-kitchen",
          name: "Kitchen",
          printerIds: ["printer-1"],
          routingRules: { categoryIds: ["snack"] },
        },
      ],
    }),
  }),
}));

vi.mock("@/core/presentation/hooks/usePrinterConnection", () => ({
  usePrinterConnection: () => ({
    defaultBinding: { id: "printer-1", displayName: "Kitchen" },
    error: null,
    printTicket: mocks.printTicket,
  }),
}));

describe("CounterOrdersPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTickets.mockResolvedValue({
      tickets: [ticket],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    mocks.getTicket.mockResolvedValue(ticket);
    mocks.printTicket.mockResolvedValue(undefined);
  });

  it("lists active KDS tickets and prints the selected ticket", async () => {
    render(<CounterOrdersPage />);

    expect(await screen.findByRole("button", { name: "Print KDS-9" })).toBeInTheDocument();
    expect(mocks.listTickets).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      activeOnly: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Print KDS-9" }));
    await waitFor(() => {
      expect(mocks.getTicket).toHaveBeenCalledWith("ticket-9");
      expect(mocks.printTicket).toHaveBeenCalledWith(
        ticket,
        [
          expect.objectContaining({
            id: "station-kitchen",
            printerIds: ["printer-1"],
          }),
        ]
      );
    });
  });

  it("opens ticket details with the returned items", async () => {
    mocks.getTicket.mockResolvedValue({
      ...ticket,
      station: { id: "station-kitchen", name: "Hot line" },
      lines: [{ name: "Dish Soap", quantity: "2.0000", modifiers: "No ice" }],
    });
    render(<CounterOrdersPage />);
    await screen.findByRole("button", { name: "Print KDS-9" });

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Dish Soap")).toBeInTheDocument();
    expect(screen.getByText(/Hot line/)).toBeInTheDocument();
    expect(screen.getByText("No ice")).toBeInTheDocument();
  });
});
