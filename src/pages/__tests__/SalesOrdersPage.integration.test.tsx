import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesOrdersPage } from "../SalesOrdersPage";

const mocks = vi.hoisted(() => ({
  fetchOrders: vi.fn(),
  fetchOrderById: vi.fn(),
  fetchOrderLines: vi.fn(),
  createOrder: vi.fn(),
  deleteOrder: vi.fn(),
}));

const order = {
  id: "order-1",
  tenantId: "tenant-1",
  locationId: "location-1",
  orderNumber: "SO-001",
  salesChannel: "POS",
  serviceType: "DINE_IN",
  status: "DRAFT",
  subtotal: "10.0000",
  totalDiscount: "0.0000",
  totalTax: "0.0000",
  grandTotal: "10.0000",
  customerName: "Jane Doe",
  itemSummary: "Coffee",
  itemCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "salesOrders.tabs.open": "Open",
        "salesOrders.tabs.completed": "Completed",
        "salesOrders.tabs.voided": "Voided",
        "salesOrders.search": "Search order number, customer, or item",
        "salesOrders.create": "Create sales order",
        "salesOrders.empty": "No orders yet",
        "salesOrders.detailTitle": "Sales order",
        "salesOrders.lines": "Items",
        "salesOrders.noLines": "No items on this order",
        "salesOrders.walkIn": "Walk-in",
        "salesOrders.total": "Total",
        "cashier.serviceTypes.dineIn": "Dine In",
        "salesOrders.created": `Order ${options?.number ?? ""} created`,
        "common.delete": "Delete",
        "common.cancel": "Cancel",
      };
      return labels[key] || key;
    },
  }),
}));

vi.mock("@/core/presentation/hooks/useVenueSetting", () => ({
  useVenueSetting: () => ({ taxShown: { BAR: true, SPA: true, KTV: true } }),
}));

vi.mock("../salesOrders/EditOrderDialog", () => ({
  EditOrderDialog: () => null,
}));

vi.mock("@/lib/i18n/formatters", () => ({
  useDateFormatter: () => ({
    formatDateTime: (value: string) => value,
  }),
  useNumberFormatter: () => ({
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  }),
}));

vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", tenantId: "tenant-1" },
  }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({
    activeLocationId: "location-1",
    activePosRegisterId: "register-1",
  }),
}));

vi.mock("@/core/presentation/hooks/useExtraFees", () => ({
  useExtraFees: () => ({ fees: [], isFeeLine: () => false }),
}));

vi.mock("@/core/presentation/hooks/useWorkingHostesses", () => ({
  useWorkingHostesses: () => ({ hostesses: [], load: () => Promise.resolve() }),
}));

vi.mock("@/core/presentation/hooks/useRoomText", () => ({
  useRoomText: () => (key: string) => key,
}));

vi.mock("@/core/presentation/hooks/usePrinterConnection", () => ({
  usePrinterConnection: () => ({
    printReceipt: vi.fn().mockResolvedValue(undefined),
    printKitchen: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("@/core/presentation/hooks/useSalesOrderManagement", () => ({
  useSalesOrderManagement: () => ({
    orders: [order],
    page: 1,
    totalPages: 1,
    selectedOrder: null,
    orderLines: [],
    isLoading: false,
    error: null,
    fetchOrders: mocks.fetchOrders,
    fetchOrderById: mocks.fetchOrderById,
    fetchOrderLines: mocks.fetchOrderLines,
    createOrder: mocks.createOrder,
    deleteOrder: mocks.deleteOrder,
    updateOrder: vi.fn(),
    addOrderLine: vi.fn(),
    updateOrderLine: vi.fn(),
    deleteOrderLine: vi.fn(),
    fireOrderLine: vi.fn(),
    readyOrderLine: vi.fn(),
    serveOrderLine: vi.fn(),
    voidOrderLine: vi.fn(),
    compOrderLine: vi.fn(),
    previewOrderEdit: vi.fn(),
    editOrder: vi.fn(),
    fetchOrderEdits: vi.fn().mockResolvedValue([]),
    clearSelectedOrder: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe("SalesOrdersPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchOrders.mockResolvedValue({
      orders: [order],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mocks.fetchOrderById.mockResolvedValue(order);
    mocks.fetchOrderLines.mockResolvedValue({ lines: [] });
    mocks.createOrder.mockResolvedValue(order);
  });

  it("loads orders and creates a draft sales order", async () => {
    render(<SalesOrdersPage />);

    await waitFor(() => expect(mocks.fetchOrders).toHaveBeenCalled());
    expect(screen.getByText("SO-001")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe · Dine In · Coffee/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Create sales order" })
    );

    await waitFor(() =>
      expect(mocks.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          locationId: "location-1",
          status: "DRAFT",
        })
      )
    );
  });

  it("filters by status tab and opens order details", async () => {
    render(<SalesOrdersPage />);

    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    await waitFor(() =>
      expect(mocks.fetchOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: "COMPLETED" })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "SO-001" }));
    await waitFor(() => {
      expect(mocks.fetchOrderById).toHaveBeenCalledWith("order-1");
      expect(mocks.fetchOrderLines).toHaveBeenCalledWith("order-1", {
        page: 1,
        limit: 50,
      });
    });
  });
});
