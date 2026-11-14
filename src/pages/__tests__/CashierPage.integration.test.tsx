import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render as mount, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CashierPage } from "../CashierPage";
import { writeTableOrderIds } from "@/lib/pos/multiOrdering";


/** Opens every bill row: the panel keeps each row's details collapsed. */
const openRows = () => {
  for (const toggle of screen.queryAllByRole("button", {
    name: /cashier\.orderPanel\.lineDetails/,
  })) {
    if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  }
};

/** Renders the till with its bill rows open: the panel keeps them collapsed. */
const render = (ui: Parameters<typeof mount>[0]) => {
  const result = mount(ui);
  openRows();
  return result;
};

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  addTableCharge: vi.fn(),
  stopTableCharges: vi.fn(),
  addProductToTableSession: vi.fn(),
  updateOrderLine: vi.fn(),
  splitOrderLine: vi.fn(),
  removeOrderLine: vi.fn(),
  checkoutTableSession: vi.fn(),
  closePosSession: vi.fn(),
  createPosRegister: vi.fn(),
  createPosSession: vi.fn(),
  fetchPosRegisters: vi.fn(),
  fetchPosSessions: vi.fn(),
  fetchProductVariants: vi.fn(),
  fireToKds: vi.fn(),
  getCounterOrderById: vi.fn(),
  pickupCounterOrder: vi.fn(),
  openTableSession: vi.fn(),
  selectOrderById: vi.fn(),
  updateDiningTableStatus: vi.fn(),
  updateTableSessionState: vi.fn(),
  fetchManagedOrderLines: vi.fn(),
  addManagedOrderLine: vi.fn(),
  deleteManagedOrderLine: vi.fn(),
  updateManagedOrder: vi.fn(),
  deleteManagedOrder: vi.fn(),
  voidCheckout: vi.fn(),
  refreshDiningTableStatus: vi.fn(),
  printKitchen: vi.fn(),
  printReceipt: vi.fn(),
  listStations: vi.fn(),
  fetchOrderBill: vi.fn(),
  loadHostesses: vi.fn(),
  settleOrder: vi.fn(),
  processCheckout: vi.fn(),
  getLatestSessionByTableId: vi.fn(),
}));

const product = {
  id: "product-1",
  tenantId: "tenant-1",
  categoryId: "cat-drinks",
  categoryName: "Drinks",
  name: "Coffee",
  basePrice: "10.0000",
  baseSku: "COFFEE",
  isTaxable: true,
  taxRate: 5,
  isPriceInclusive: false,
};

const soup = {
  id: "product-2",
  tenantId: "tenant-1",
  categoryId: "cat-main",
  categoryName: "Main",
  name: "Deli Soup",
  basePrice: "8.0000",
};

const variant = {
  id: "variant-1",
  productId: "product-1",
  variantSku: "COFFEE-LARGE",
};

const order = {
  id: "order-1",
  tenantId: "tenant-1",
  locationId: "branch-1",
  orderNumber: "POS-001",
  salesChannel: "POS",
  serviceType: "PICK_UP",
  status: "DRAFT",
  grandTotal: "10.5000",
  subtotal: "10.0000",
  totalTax: "0.0000",
  totalDiscount: "0.0000",
  createdAt: "",
  updatedAt: "",
};

const session = {
  id: "session-1",
  tenantId: "tenant-1",
  tableId: "table-1",
  guestCount: 2,
  openedAt: "2026-08-29T00:00:00Z",
  closedAt: null,
  salesOrderId: "order-1",
  sessionState: "SEATED",
};

const table = {
  id: "table-1",
  tenantId: "tenant-1",
  zoneId: "zone-1",
  tableNumber: "T1",
  maxSeats: 4,
  status: "OCCUPIED",
};

const orderLine = {
  id: "line-1",
  salesOrderId: "order-1",
  variantId: "variant-1",
  quantity: "1.0000",
  unitPrice: "10.0000",
  lineDiscount: "0.0000",
  taxAmount: "0.0000",
};

let selectedOrderLinesState: Array<
  typeof orderLine & {
    status?: string;
    firedAt?: string;
    selectedModifiers?: Record<string, unknown>;
  }
> = [orderLine];
let selectedOrderState: typeof order | null = order;
let activeServiceTypeState = "TABLE";
let salesOrdersState: Array<typeof order> = [order];
let diningTablesState: Array<typeof table> = [table];
let tableSessionsState: Array<typeof session> = [session];
let productState = product;
let venueSettingsState = {
  defaultTaxRate: null,
  serviceChargeBps: 0,
  serviceChargeOn: { BAR: true, SPA: true, KTV: true },
  serviceChargeTaxRate: 0,
  kdsDeleteSlips: true,
};

vi.mock("@/lib/i18n/formatters", () => ({
  useNumberFormatter: () => ({ formatCurrency: (value: number) => String(value) }),
  useDateFormatter: () => ({ formatDateTime: (value: string) => value }),
}));

vi.mock("@/components/shift/shiftApi", () => ({
  shiftApi: () => ({ approve: mocks.approve }),
}));

vi.mock("@/core/presentation/hooks/useVenueSetting", () => ({
  useVenueSetting: () => venueSettingsState,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "cashier-1",
      tenantId: "tenant-1",
      activeBranchId: "branch-1",
      permissions: ["sales:checkout:write"],
    },
  }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({
    activeLocationId: "location-1",
    activePosRegisterId: "register-1",
    activePosSessionId: "pos-session-1",
    isWorkspaceReady: true,
    isPosSessionLoading: false,
    isSetupModalOpen: false,
    requireCashierContext: vi.fn().mockResolvedValue({
      tenantId: "tenant-1",
      locationId: "location-1",
      posRegisterId: "register-1",
      posSessionId: "pos-session-1",
    }),
    refreshPosContext: vi.fn(),
  }),
}));

vi.mock("@/core/presentation/hooks/useKdsStationManagement", () => ({
  useKdsStationManagement: () => ({
    stations: [],
    isLoading: false,
    error: null,
    listStations: mocks.listStations,
    createStation: vi.fn(),
    updateStation: vi.fn(),
    deleteStation: vi.fn(),
  }),
}));

vi.mock("@/core/presentation/hooks/usePrinterConnection", () => ({
  usePrinterConnection: () => ({
    printKitchen: mocks.printKitchen,
    printReceipt: mocks.printReceipt,
    error: null,
  }),
}));

let tableChargesState: { offered: Record<string, unknown>[]; running: Record<string, unknown>[] } = {
  offered: [],
  running: [],
};
let tableChargesLoadedState = false;
vi.mock("@/core/presentation/hooks/useTableCharges", () => ({
  useTableCharges: () => ({
    charges: tableChargesState,
    add: mocks.addTableCharge,
    stop: mocks.stopTableCharges,
    isLoaded: tableChargesLoadedState,
    isBusy: false,
    error: null,
  }),
}));

vi.mock("@/core/presentation/hooks/useWorkingHostesses", () => ({
  useWorkingHostesses: () => ({
    hostesses: [
      { id: "hostess-snow", name: "Ma Hnin", nickname: "Snow", inRoom: null },
      { id: "hostess-rose", name: "Ma Thiri", nickname: "Rose", inRoom: null },
    ],
    isLoading: false,
    error: null,
    load: mocks.loadHostesses,
  }),
}));

vi.mock("../cashier/CreditCustomerPicker", () => ({
  CreditCustomerPicker: ({ onPick }: { onPick: (customer: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onPick({ id: "kyaw", name: "U Kyaw", maxCreditLimit: "200000", currentCreditBalance: "85000" })
      }
    >
      pick U Kyaw
    </button>
  ),
}));
vi.mock("@/core/presentation/hooks/useCashier", () => ({
  useCashier: () => ({
    products: [
      productState,
      soup,
      { ...product, id: "product-vip", name: "VIP room fee", kind: "RENTAL" },
      { ...product, id: "product-spa-tea", name: "Spa tea", soldAt: ["SPA"] },
      { ...product, id: "product-hostess", name: "Hostess hour", askWhoServed: true },
    ],
    variantsByProductId: { "product-1": [variant] },
    salesOrders: salesOrdersState,
    selectedOrder: selectedOrderState,
    selectedOrderLines: selectedOrderLinesState,
    paymentMethods: [
      { id: "cash", tenantId: "tenant-1", name: "Cash" },
      { id: "credit", tenantId: "tenant-1", name: "House credit", kind: "CUSTOMER_CREDIT" },
    ],
    diningZones: [],
    diningTables: diningTablesState,
    tableSessions: tableSessionsState,
    activeServiceType: activeServiceTypeState,
    setActiveServiceType: vi.fn(),
    activeLocationId: "location-1",
    setActiveLocationId: vi.fn(),
    inventoryLocations: [{ id: "location-1", tenantId: "tenant-1", name: "Main", type: "store" }],
    fetchInventoryLocations: vi.fn().mockResolvedValue("location-1"),
    isLocationsLoading: false,
    isLoading: false,
    error: null,
    fetchProducts: vi.fn().mockResolvedValue(undefined),
    fetchProductVariants: mocks.fetchProductVariants,
    fetchSalesOrders: vi.fn().mockResolvedValue(undefined),
    fetchPaymentMethods: vi.fn().mockResolvedValue(undefined),
    fetchPosRegisters: mocks.fetchPosRegisters,
    createPosRegister: mocks.createPosRegister,
    fetchPosSessions: mocks.fetchPosSessions,
    createPosSession: mocks.createPosSession,
    closePosSession: mocks.closePosSession,
    fetchDiningZones: vi.fn().mockResolvedValue(undefined),
    fetchDiningTables: vi.fn().mockResolvedValue(undefined),
    fetchTableSessions: vi.fn().mockResolvedValue(undefined),
    refreshDiningTableStatus: mocks.refreshDiningTableStatus,
    updateDiningTableStatus: mocks.updateDiningTableStatus,
    openTableSession: mocks.openTableSession,
    checkoutTableSession: mocks.checkoutTableSession,
    updateTableSessionState: mocks.updateTableSessionState,
    fireToKds: mocks.fireToKds,
    getLatestSessionByTableId: mocks.getLatestSessionByTableId,
    selectOrder: vi.fn(),
    selectOrderById: mocks.selectOrderById,
    createOrder: vi.fn(),
    addProductToOrder: vi.fn(),
    updateOrderLine: mocks.updateOrderLine,
    splitOrderLine: mocks.splitOrderLine,
    removeOrderLine: mocks.removeOrderLine,
    addProductToTableSession: mocks.addProductToTableSession,
    getCounterOrderById: mocks.getCounterOrderById,
    pickupCounterOrder: mocks.pickupCounterOrder,
    processCheckout: mocks.processCheckout,
    voidCheckout: mocks.voidCheckout,
    discountReasons: [],
    fetchDiscountReasons: vi.fn().mockResolvedValue(undefined),
    resolveTableWarning: vi.fn().mockReturnValue(null),
    clearOrderSelection: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("@/core/presentation/hooks/useSalesOrderManagement", () => ({
  useSalesOrderManagement: () => ({
    fetchOrderLines: mocks.fetchManagedOrderLines,
    addOrderLine: mocks.addManagedOrderLine,
    deleteOrderLine: mocks.deleteManagedOrderLine,
    updateOrder: mocks.updateManagedOrder,
    deleteOrder: mocks.deleteManagedOrder,
    fetchOrderBill: mocks.fetchOrderBill,
    settleOrder: mocks.settleOrder,
  }),
}));

vi.mock("@/core/presentation/hooks/useGuestWalletManagement", () => ({
  useGuestWalletManagement: () => ({
    lookupCard: vi.fn(),
    getWallet: vi.fn(),
  }),
}));

describe("CashierPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approve.mockResolvedValue({ token: "approval-token" });
    window.localStorage.clear();
    selectedOrderLinesState = [orderLine];
    selectedOrderState = order;
    activeServiceTypeState = "TABLE";
    salesOrdersState = [order];
    diningTablesState = [table];
    tableSessionsState = [session];
    mocks.getLatestSessionByTableId.mockReturnValue(session);
    productState = product;
    venueSettingsState = {
      defaultTaxRate: null,
      serviceChargeBps: 0,
      serviceChargeOn: { BAR: true, SPA: true, KTV: true },
      serviceChargeTaxRate: 0,
      kdsDeleteSlips: true,
    };
    mocks.processCheckout.mockResolvedValue({ orderId: "direct-order-1" });
    tableChargesState = { offered: [], running: [] };
    tableChargesLoadedState = false;
    mocks.addTableCharge.mockResolvedValue({ offered: [], running: [] });
    mocks.stopTableCharges.mockResolvedValue({ offered: [], running: [] });
    mocks.fetchProductVariants.mockResolvedValue([variant]);
    mocks.fetchManagedOrderLines.mockResolvedValue({
      lines: [],
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 1,
    });
    mocks.fetchPosRegisters.mockResolvedValue([
      {
        id: "register-1",
        tenantId: "tenant-1",
        locationId: "location-1",
        code: "R-01",
        name: "Register 1",
      },
    ]);
    mocks.fetchPosSessions.mockResolvedValue([
      {
        id: "pos-session-1",
        tenantId: "tenant-1",
        registerId: "register-1",
        cashierId: "cashier-1",
        status: "OPEN",
        closedAt: null,
      },
    ]);
    mocks.createPosRegister.mockResolvedValue({
      id: "register-1",
      tenantId: "tenant-1",
      locationId: "location-1",
      code: "R-01",
      name: "Register 1",
    });
    mocks.createPosSession.mockResolvedValue({
      id: "pos-session-1",
      tenantId: "tenant-1",
      registerId: "register-1",
      cashierId: "cashier-1",
      status: "OPEN",
      closedAt: null,
    });
    mocks.closePosSession.mockResolvedValue({
      id: "pos-session-1",
      tenantId: "tenant-1",
      registerId: "register-1",
      cashierId: "cashier-1",
      status: "CLOSED",
      closedAt: "2026-08-29T00:00:00Z",
    });
    mocks.addProductToTableSession.mockResolvedValue({
      id: "line-2",
      salesOrderId: "order-1",
    });
    mocks.updateTableSessionState.mockResolvedValue({
      ...session,
      sessionState: "ORDERING",
    });
    mocks.updateDiningTableStatus.mockResolvedValue({
      ...table,
      status: "DIRTY",
    });
    mocks.refreshDiningTableStatus.mockResolvedValue(true);
    mocks.getCounterOrderById.mockResolvedValue({ id: "order-1" });
    mocks.pickupCounterOrder.mockResolvedValue({ id: "order-1" });
    mocks.fireToKds.mockResolvedValue({});
    mocks.printKitchen.mockResolvedValue({
      jobs: [],
      unrouted: [],
      missingPrinterRoutes: [],
    });
    mocks.listStations.mockResolvedValue({ stations: [] });
    mocks.printReceipt.mockResolvedValue(undefined);
    mocks.checkoutTableSession.mockResolvedValue({
      ...session,
      sessionState: "CLOSED",
    });
    mocks.updateManagedOrder.mockResolvedValue({
      ...order,
      status: "VOIDED",
    });
    mocks.voidCheckout.mockResolvedValue({ orderId: "order-1" });
    mocks.selectOrderById.mockResolvedValue(order);
    mocks.fetchOrderBill.mockImplementation(async (_id, query) => ({
      orderId: "order-1", subtotal: "10.0000", totalDiscount: "0.0000",
      addedTax: query.includeTax ? "0.5000" : "0.0000",
      totalTax: query.includeTax ? "0.5000" : "0.0000",
      serviceCharge: "0.0000", serviceChargeTax: "0.0000",
      grandTotal: query.includeTax ? "10.5000" : "10.0000",
    }));
    mocks.openTableSession.mockResolvedValue(session);
  });

  describe("board service tab counts", () => {
    /** The Dine In service tab, whose badge sits beside its label. */
    const dineInTab = () =>
      screen.getByRole("button", { name: /cashier\.serviceTypes\.dineIn/ });

    const dineInDraft = (id: string, orderNumber: string) => ({
      ...order,
      id,
      orderNumber,
      serviceType: "DINE_IN",
      status: "DRAFT",
    });

    it("keeps a dine-in draft no table session owns out of the badge", async () => {
      activeServiceTypeState = "DINE_IN";
      salesOrdersState = [dineInDraft("order-orphan", "POS-ORPHAN")];
      mocks.getLatestSessionByTableId.mockReturnValue(undefined);

      render(<MemoryRouter initialEntries={["/cashier"]}><CashierPage /></MemoryRouter>);

      await waitFor(() =>
        expect(dineInTab().textContent).toBe("cashier.serviceTypes.dineIn0")
      );
      // The draft has no tile on the table board, so it is not on screen either.
      expect(screen.queryByText("POS-ORPHAN")).not.toBeInTheDocument();
      expect(screen.getByText("T1")).toBeInTheDocument();
    });

    it("counts the dine-in order of a table that is still open", async () => {
      activeServiceTypeState = "DINE_IN";
      salesOrdersState = [dineInDraft("order-seated", "POS-SEATED")];
      mocks.getLatestSessionByTableId.mockReturnValue({
        ...session,
        salesOrderId: "order-seated",
      });

      render(<MemoryRouter initialEntries={["/cashier"]}><CashierPage /></MemoryRouter>);

      await waitFor(() =>
        expect(dineInTab().textContent).toBe("cashier.serviceTypes.dineIn1")
      );
    });
  });

  describe("direct checkout bill options", () => {
    const startDirectBill = async () => {
      render(<MemoryRouter initialEntries={["/cashier?view=menu"]}><CashierPage /></MemoryRouter>);
      fireEvent.click(screen.getByRole("button", { name: "cashier.newOrder" }));
      await waitFor(() => expect(screen.getByText("cashier.orderPanel.cartStarted")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));
      await waitFor(() => expect(screen.getByRole("button", { name: "cashier.payNow" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "cashier.payNow" }));
      await screen.findByRole("button", { name: "cashier.payment.options" }, { timeout: 5000 });
    };

    beforeEach(() => {
      selectedOrderState = null;
      selectedOrderLinesState = [];
      activeServiceTypeState = "TAKE_AWAY";
      venueSettingsState = {
        defaultTaxRate: null,
        serviceChargeBps: 1000,
        serviceChargeOn: { BAR: true, SPA: true, KTV: true },
        serviceChargeTaxRate: 0.1,
      };
    });

    it.each([
      { inclusive: false, includeTax: false, includeServiceCharge: true, expected: "99.0000", service: "9.0000", tax: undefined },
      { inclusive: false, includeTax: false, includeServiceCharge: false, expected: "90.0000", service: undefined, tax: undefined },
      { inclusive: false, includeTax: true, includeServiceCharge: false, expected: "99.0000", service: undefined, tax: "9.0000" },
      { inclusive: false, includeTax: true, includeServiceCharge: true, expected: "108.9000", service: "9.0000", tax: "9.9000" },
      { inclusive: true, includeTax: false, includeServiceCharge: true, expected: "99.0000", service: "9.0000", tax: undefined },
      { inclusive: true, includeTax: false, includeServiceCharge: false, expected: "90.0000", service: undefined, tax: undefined },
      { inclusive: true, includeTax: true, includeServiceCharge: false, expected: "99.0000", service: undefined, tax: "9.0000" },
      { inclusive: true, includeTax: true, includeServiceCharge: true, expected: "108.9000", service: "9.0000", tax: "9.9000" },
    ])("matches discounted direct totals and receipts: inclusive=$inclusive tax=$includeTax service=$includeServiceCharge", async ({
      inclusive, includeTax, includeServiceCharge, expected, service, tax,
    }) => {
      productState = { ...product, basePrice: inclusive ? "110.0000" : "100.0000", taxRate: 10, isPriceInclusive: inclusive };
      await startDirectBill();
      fireEvent.click(screen.getByRole("button", { name: /cashier.billOptions.title/ }));
      fireEvent.change(screen.getByRole("textbox", { name: "cashier.orderPanel.discount" }), {
        target: { value: inclusive ? "11" : "10" },
      });
      fireEvent.click(screen.getByRole("button", { name: "cashier.billOptions.done" }));
      fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
      const taxCheckbox = screen.getByRole("checkbox", { name: "cashier.payment.includeTax" });
      const serviceCheckbox = screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" });
      expect(taxCheckbox).toBeChecked();
      expect(serviceCheckbox).toBeChecked();
      // Returning to both enabled must still use the same discounted calculation.
      fireEvent.click(taxCheckbox);
      if (includeTax) fireEvent.click(taxCheckbox);
      if (!includeServiceCharge) fireEvent.click(serviceCheckbox);
      await waitFor(() => expect(screen.getAllByText(Number(expected).toFixed(2)).length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" }));
      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.processCheckout).toHaveBeenCalledWith(expect.objectContaining({
        includeTax,
        includeServiceCharge,
        serviceType: "TAKEAWAY",
        items: [{ variantId: "variant-1", quantity: "1.0000", lineDiscount: inclusive ? "11.0000" : "10.0000" }],
        payments: [{ paymentMethodId: "cash", amount: expected }],
      })));
      await waitFor(() => expect(mocks.printReceipt).toHaveBeenCalledWith(expect.objectContaining({
        total: expected,
        subtotal: inclusive ? (includeTax ? "110.0000" : "101.0000") : "100.0000",
        discount: inclusive ? "11.0000" : "10.0000",
        tax,
        serviceCharge: service,
      })));
      expect(mocks.fetchOrderBill).not.toHaveBeenCalled();
      expect(mocks.checkoutTableSession).not.toHaveBeenCalled();
      expect(mocks.settleOrder).not.toHaveBeenCalled();
    });

    // The slip prints Tax and Service charge as rows of their own under the
    // items, so its Subtotal is the items' money and the rows add up to TOTAL.
    it("prints the items alone as the subtotal when no bill option was changed", async () => {
      productState = { ...product, basePrice: "100.0000", taxRate: 10 };
      await startDirectBill();
      fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" }));
      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.printReceipt).toHaveBeenCalled());
      const slip = mocks.printReceipt.mock.calls[0][0];
      // The item at 100, then the tax (with the tax on the service charge) and
      // the service charge on their own rows.
      expect(slip.subtotal).toBe("100.0000");
      expect(slip.tax).toBe("11.0000");
      expect(slip.serviceCharge).toBe("10.0000");
      expect(slip.total).toBe("121.0000");
      expect(
        Number(slip.subtotal) + Number(slip.tax) + Number(slip.serviceCharge)
      ).toBeCloseTo(Number(slip.total), 2);
    });

    it("asks whose account a credit payment goes on and sends that customer", async () => {
      productState = { ...product, basePrice: "100.0000", taxRate: 10 };
      await startDirectBill();
      fireEvent.click(screen.getByRole("button", { name: /HOUSE CREDIT/ }));
      fireEvent.click(await screen.findByRole("button", { name: "pick U Kyaw" }));
      expect(screen.getByText("U Kyaw")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.processCheckout).toHaveBeenCalled());
      expect(mocks.processCheckout.mock.calls[0][0]).toMatchObject({
        customerId: "kyaw",
        payments: [{ paymentMethodId: "credit" }],
      });
    });

    it("does not pay on credit before a customer is chosen", async () => {
      productState = { ...product, basePrice: "100.0000", taxRate: 10 };
      await startDirectBill();
      fireEvent.click(screen.getByRole("button", { name: /HOUSE CREDIT/ }));
      await screen.findByRole("button", { name: "pick U Kyaw" });

      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      expect(await screen.findByText("cashier.credit.required")).toBeInTheDocument();
      expect(mocks.processCheckout).not.toHaveBeenCalled();
    });

    it("keeps both direct checkout charges enabled and omits flags until a choice is made", async () => {
      productState = { ...product, basePrice: "100.0000", taxRate: 10 };
      await startDirectBill();
      fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
      expect(screen.getByRole("checkbox", { name: "cashier.payment.includeTax" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" })).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.processCheckout).toHaveBeenCalled());
      const payload = mocks.processCheckout.mock.calls[0][0];
      expect(payload.payments).toEqual([{ paymentMethodId: "cash", amount: "121.0000" }]);
      expect(payload).not.toHaveProperty("includeTax");
      expect(payload).not.toHaveProperty("includeServiceCharge");
      expect(mocks.fetchOrderBill).not.toHaveBeenCalled();
    });

    it("resets direct bill choices after successful checkout instead of reusing removed charges", async () => {
      productState = { ...product, basePrice: "110.0000", taxRate: 10, isPriceInclusive: true };
      await startDirectBill();
      fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeTax" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" }));
      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));
      await waitFor(() => expect(mocks.processCheckout).toHaveBeenCalledWith(expect.objectContaining({
        includeTax: false, includeServiceCharge: false,
        payments: [{ paymentMethodId: "cash", amount: "100.0000" }],
      })));

      await screen.findByText("cashier.orderPanel.checkoutSuccess");
      await waitFor(() => expect(screen.getByRole("button", { name: "cashier.newOrder" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "cashier.newOrder" }));
      await waitFor(() => expect(screen.getByText("cashier.orderPanel.cartStarted")).toBeInTheDocument());
      fireEvent.click(await screen.findByRole("button", { name: /Coffee/ }));
      await waitFor(() => expect(screen.getByRole("button", { name: "cashier.payNow" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "cashier.payNow" }));
      fireEvent.click(await screen.findByRole("button", { name: "cashier.payment.options" }));
      expect(screen.getByRole("checkbox", { name: "cashier.payment.includeTax" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" })).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.processCheckout).toHaveBeenCalledTimes(2));
      const secondBill = mocks.processCheckout.mock.calls[1][0];
      expect(secondBill.payments).toEqual([{ paymentMethodId: "cash", amount: "121.0000" }]);
      expect(secondBill).not.toHaveProperty("includeTax");
      expect(secondBill).not.toHaveProperty("includeServiceCharge");
    });
  });

  it("adds a new line for an item removed from a table bill", async () => {
    writeTableOrderIds("table-1", ["order-1"]);
    mocks.fetchManagedOrderLines.mockResolvedValue({
      lines: [orderLine],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    });
    mocks.removeOrderLine.mockImplementation(async () => {
      selectedOrderLinesState = [];
    });
    mocks.addProductToTableSession.mockResolvedValue({ ...orderLine, id: "line-new" });
    const { rerender } = render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /^T1/ }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("cashier.productMenu.search")).toBeInTheDocument()
    );
    expect(mocks.fetchManagedOrderLines).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.removeItem" }));
    await waitFor(() => expect(mocks.removeOrderLine).toHaveBeenCalledWith("order-1", "line-1"));
    rerender(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));

    await waitFor(() => expect(mocks.addProductToTableSession).toHaveBeenCalled());
    expect(mocks.updateOrderLine).not.toHaveBeenCalled();
  });

  it("shows a table line at the price saved for this bill, not the menu price", () => {
    selectedOrderLinesState = [{ ...orderLine, unitPrice: "8.0000" }];
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    const row = screen.getByRole("group", { name: "cashier.orderPanel.priceNote.discount" });
    expect(row).toHaveTextContent("@ 8.00");
    expect(row).toHaveTextContent("10.00");
  });

  it("increments an existing product line instead of adding a duplicate", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));

    await waitFor(() =>
      expect(mocks.updateOrderLine).toHaveBeenCalledWith("order-1", "line-1", {
        variantId: "variant-1",
        quantity: "2.0000",
        unitPrice: "10.0000",
        lineDiscount: "0.0000",
        taxAmount: "0.0000",
        seatNumber: undefined,
      })
    );
    expect(mocks.addProductToTableSession).not.toHaveBeenCalled();
    expect(mocks.updateTableSessionState).toHaveBeenCalledWith("session-1", {
      sessionState: "ORDERING",
    });
  });

  it("asks which hostess gives a hostess service and sends her with it", async () => {
    mocks.addProductToTableSession.mockResolvedValue({ ...orderLine, id: "line-hostess" });
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Hostess hour/ }));
    expect(mocks.addProductToTableSession).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Snow/ }));

    await waitFor(() =>
      expect(mocks.addProductToTableSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ id: "product-hostess" }),
        expect.anything(),
        1,
        undefined,
        undefined,
        undefined,
        "hostess-snow"
      )
    );
  });

  it("saves who ordered an item from Edit item", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    expect(screen.getByRole("button", { name: "cashier.lineEdit.customer" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Rose" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));

    await waitFor(() =>
      expect(mocks.updateOrderLine).toHaveBeenCalledWith(
        "order-1",
        "line-1",
        expect.objectContaining({ hostessId: "hostess-rose" })
      )
    );
  });

  it("saves a new price and FOC for a table line in one update", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    fireEvent.change(screen.getByLabelText("cashier.lineEdit.price"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "cashier.lineEdit.foc" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));

    await waitFor(() =>
      expect(mocks.updateOrderLine).toHaveBeenCalledExactlyOnceWith(
        "order-1",
        "line-1",
        expect.objectContaining({
          variantId: "variant-1",
          quantity: "1.0000",
          unitPrice: "8.0000",
          lineDiscount: "8.0000",
        })
      )
    );
  });

  it("splits one water off a sent line of 4 and prices it on its own", async () => {
    selectedOrderLinesState = [
      { ...orderLine, quantity: "4.0000", unitPrice: "2000.0000", status: "FIRED" },
    ];
    mocks.splitOrderLine.mockResolvedValue({
      ...orderLine,
      id: "line-part",
      quantity: "1.0000",
      unitPrice: "2000.0000",
      status: "FIRED",
    });
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "cashier.orderPanel.decreaseQuantity",
        })
      );
    }
    fireEvent.change(screen.getByLabelText("cashier.lineEdit.price"), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));

    await waitFor(() =>
      expect(mocks.updateOrderLine).toHaveBeenCalledExactlyOnceWith(
        "order-1",
        "line-part",
        expect.objectContaining({ quantity: "1.0000", unitPrice: "1500.0000" })
      )
    );
    expect(mocks.splitOrderLine).toHaveBeenCalledExactlyOnceWith("order-1", "line-1", "1.0000");
    expect(mocks.addProductToTableSession).not.toHaveBeenCalled();
  });

  it("adds a new pending line after Send KDS so the kitchen receives it", async () => {
    selectedOrderLinesState = [{ ...orderLine, status: "FIRED" }];
    mocks.addProductToTableSession.mockResolvedValue({
      ...orderLine,
      id: "line-new",
      status: "PENDING",
    });
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));

    await waitFor(() =>
      expect(mocks.addProductToTableSession).toHaveBeenCalledWith(
        "session-1",
        productState,
        "variant-1",
        1,
        undefined,
        undefined,
        undefined,
        undefined
      )
    );
    expect(mocks.updateOrderLine).not.toHaveBeenCalled();
  });

  it("prints a copy a promotion gave away at 0 on the receipt", async () => {
    selectedOrderLinesState = [
      orderLine,
      {
        ...orderLine,
        id: "line-2",
        lineDiscount: "10.0000",
        appliedPromotionId: "promo-1",
      },
    ];
    render(
      <MemoryRouter initialEntries={["/cashier?view=pay"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.printFinance" }));

    await waitFor(() =>
      expect(mocks.printReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ name: "Coffee", unitPrice: "10.0000" }),
            expect.objectContaining({ name: "Coffee", unitPrice: "0.0000" }),
          ],
        })
      )
    );
  });

  it("prints duplicate item lines as one combined quantity on the receipt", async () => {
    selectedOrderLinesState = [
      orderLine,
      { ...orderLine, id: "line-2" },
    ];
    render(
      <MemoryRouter initialEntries={["/cashier?view=pay"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.printFinance" }));

    await waitFor(() =>
      expect(mocks.printReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [expect.objectContaining({ name: "Coffee", quantity: "2" })],
        })
      )
    );
  });

  it("adds a pending line when plus is pressed on a sent item", async () => {
    selectedOrderLinesState = [{ ...orderLine, status: "FIRED" }];
    mocks.addProductToTableSession.mockResolvedValue({
      ...orderLine,
      id: "line-new",
      status: "PENDING",
    });
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.increaseQuantity" })
    );

    await waitFor(() =>
      expect(mocks.addProductToTableSession).toHaveBeenCalledWith(
        "session-1",
        productState,
        "variant-1",
        1,
        undefined,
        [],
        undefined,
        undefined
      )
    );
    expect(mocks.updateOrderLine).not.toHaveBeenCalled();
  });

  it("merges rapid repeated product taps into the newly created line", async () => {
    selectedOrderLinesState = [];
    mocks.addProductToTableSession.mockResolvedValue({
      ...orderLine,
      id: "line-new",
    });

    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    const productButton = screen.getByRole("button", { name: /Coffee/ });
    fireEvent.click(productButton);
    fireEvent.click(productButton);

    await waitFor(() =>
      expect(mocks.updateOrderLine).toHaveBeenCalledWith(
        "order-1",
        "line-new",
        {
          variantId: "variant-1",
          quantity: "2.0000",
          unitPrice: "10.0000",
          lineDiscount: "0.0000",
          taxAmount: "0.0000",
          seatNumber: undefined,
        }
      )
    );
    expect(mocks.addProductToTableSession).toHaveBeenCalledTimes(1);
  });

  it("shows menu categories in the menu session and filters products", () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    // The side list on wide screens and the strip over the menu on narrower ones.
    expect(
      screen.getAllByRole("button", { name: "cashier.productMenu.allCategories" })
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Drinks" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Main" })).toHaveLength(2);
    expect(
      screen.getByText("cashier.productMenu.categories")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coffee/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deli Soup/ })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Main" })[0]);

    expect(screen.queryByRole("button", { name: /Coffee/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deli Soup/ })).toBeInTheDocument();
  });

  it("prints selected modifiers on the KDS station slip", async () => {
    selectedOrderLinesState = [
      {
        ...orderLine,
        selectedModifiers: {
          "modifier-1": { name: "Oat milk", priceDelta: "1.5000" },
        },
      },
    ];

    render(
      <MemoryRouter initialEntries={["/cashier?view=pay"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.sendKds" })
    );

    await waitFor(() =>
      expect(mocks.printKitchen).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              name: "Coffee",
              modifiers: "Oat milk",
              modifierPrices: "1.5000",
            }),
          ],
        }),
        expect.any(Array),
        expect.objectContaining({ requireStationRouting: true })
      )
    );
  });

  it("prints selected modifiers on the paid receipt", async () => {
    selectedOrderLinesState = [
      {
        ...orderLine,
        selectedModifiers: {
          "modifier-1": { modifierId: "modifier-1", name: "Oat milk", priceDelta: "1.5000" },
        },
      },
    ];

    render(
      <MemoryRouter initialEntries={["/cashier?view=pay"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" })
    );
    fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

    await waitFor(() => expect(mocks.printReceipt).toHaveBeenCalled());
    const slip = mocks.printReceipt.mock.calls[0][0] as {
      lines: Array<Record<string, unknown>>;
    };
    expect(slip.lines[0].modifiers).toBe("Oat milk");
    expect(slip.lines[0].modifierPrices).toBe("1.5000");
  });

  it("syncs totals and connects checkout, KDS, and pickup actions", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=pay"]}>
        <CashierPage />
      </MemoryRouter>
    );

    expect(screen.queryAllByText("10.50").length).toBeGreaterThan(0);

    // The bill prints only when the till ticks the box.
    expect(
      screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" })
    ).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.sendKds" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.pickedUp" })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" })
    );
    expect(window.localStorage.getItem("pos:print-bill-on-confirm")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

    await waitFor(() => {
      expect(mocks.fireToKds).toHaveBeenCalledWith({
        salesOrderId: "order-1",
      });
      expect(mocks.printKitchen).toHaveBeenCalled();
      expect(mocks.printReceipt).toHaveBeenCalled();
      expect(mocks.getCounterOrderById).toHaveBeenCalledWith("order-1");
      expect(mocks.pickupCounterOrder).toHaveBeenCalledWith("order-1");
      expect(mocks.checkoutTableSession).toHaveBeenCalledWith("session-1", {
        posSessionId: "pos-session-1",
        payments: [{ paymentMethodId: "cash", amount: "10.5000" }],
      });
      expect(mocks.updateTableSessionState).toHaveBeenCalledWith("session-1", {
        sessionState: "CLOSED",
      });
      expect(mocks.updateDiningTableStatus).toHaveBeenCalledWith(
        "table-1",
        "AVAILABLE"
      );
    });
  });

  it("does not print the bill on confirm unless the till asks for it", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=pay"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

    await waitFor(() =>
      expect(mocks.checkoutTableSession).toHaveBeenCalledWith("session-1", {
        posSessionId: "pos-session-1",
        payments: [{ paymentMethodId: "cash", amount: "10.5000" }],
      })
    );
    expect(mocks.printReceipt).not.toHaveBeenCalled();
  });

  it("quotes the tax choice, charges that amount, and excludes tax from the receipt", async () => {
    render(<MemoryRouter initialEntries={["/cashier?view=pay"]}><CashierPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeTax" }));
    await waitFor(() => expect(mocks.fetchOrderBill).toHaveBeenCalledWith("order-1", {
      discount: "0.0000", includeTax: false, includeServiceCharge: true,
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "cashier.confirmPay" })).toBeEnabled());
    expect(screen.getAllByText("10.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));
    await waitFor(() => expect(mocks.checkoutTableSession).toHaveBeenCalledWith("session-1", {
      posSessionId: "pos-session-1", payments: [{ paymentMethodId: "cash", amount: "10.0000" }],
      includeTax: false, includeServiceCharge: true,
    }));
    await waitFor(() => expect(mocks.printReceipt).toHaveBeenCalledWith(expect.objectContaining({
      tax: undefined, total: "10.0000",
    })));
  });

  it.each([
    { includeTax: true, includeServiceCharge: true, subtotal: "110.0000", totalTax: "15.5000", serviceCharge: "10.0000", expected: "125.5000" },
    { includeTax: true, includeServiceCharge: false, subtotal: "110.0000", totalTax: "15.0000", serviceCharge: "0.0000", expected: "115.0000" },
    { includeTax: false, includeServiceCharge: true, subtotal: "100.0000", totalTax: "0.0000", serviceCharge: "10.0000", expected: "110.0000" },
    { includeTax: false, includeServiceCharge: false, subtotal: "100.0000", totalTax: "0.0000", serviceCharge: "0.0000", expected: "100.0000" },
  ])("uses authoritative persisted bill totals: tax=$includeTax service=$includeServiceCharge", async ({
    includeTax, includeServiceCharge, subtotal, totalTax, serviceCharge, expected,
  }) => {
    const makeBill = (query: { includeTax: boolean; includeServiceCharge: boolean }) => ({
      orderId: "order-1",
      subtotal: query.includeTax ? "110.0000" : "100.0000",
      totalDiscount: "0.0000",
      addedTax: query.includeTax ? "5.0000" : "0.0000",
      totalTax: query.includeTax ? (query.includeServiceCharge ? "15.5000" : "15.0000") : "0.0000",
      serviceCharge: query.includeServiceCharge ? "10.0000" : "0.0000",
      serviceChargeTax: query.includeTax && query.includeServiceCharge ? "0.5000" : "0.0000",
      grandTotal: query.includeTax
        ? (query.includeServiceCharge ? "125.5000" : "115.0000")
        : (query.includeServiceCharge ? "110.0000" : "100.0000"),
    });
    mocks.fetchOrderBill.mockImplementation(async (_id, query) => makeBill(query));
    render(<MemoryRouter initialEntries={["/cashier?view=pay"]}><CashierPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
    const taxCheckbox = screen.getByRole("checkbox", { name: "cashier.payment.includeTax" });
    fireEvent.click(taxCheckbox);
    if (includeTax) fireEvent.click(taxCheckbox);
    if (!includeServiceCharge) fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "cashier.confirmPay" })).toBeEnabled());
    expect(screen.getAllByText(Number(expected).toFixed(2)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.printBillOnConfirm" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

    await waitFor(() => expect(mocks.checkoutTableSession).toHaveBeenCalledWith("session-1", {
      posSessionId: "pos-session-1",
      payments: [{ paymentMethodId: "cash", amount: expected }],
      includeTax, includeServiceCharge,
    }));
    await waitFor(() => expect(mocks.printReceipt).toHaveBeenCalledWith(expect.objectContaining({
      subtotal,
      tax: includeTax ? totalTax : undefined,
      serviceCharge: includeServiceCharge ? serviceCharge : undefined,
      total: expected,
    })));
    expect(mocks.fetchOrderBill).toHaveBeenCalledWith("order-1", {
      discount: "0.0000", includeTax, includeServiceCharge,
    });
    expect(mocks.processCheckout).not.toHaveBeenCalled();
  });

  it("pays a saved take-away order by settling it at its own line prices", async () => {
    selectedOrderState = { ...order, id: "order-2", serviceType: "TAKEAWAY", grandTotal: "0.0000", subtotal: "0.0000" };
    selectedOrderLinesState = [{ ...orderLine, salesOrderId: "order-2", unitPrice: "8.0000" }];
    activeServiceTypeState = "TAKE_AWAY";
    mocks.settleOrder.mockResolvedValue({ orderId: "order-2" });
    render(<MemoryRouter initialEntries={["/cashier?view=pay"]}><CashierPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "cashier.confirmPay" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

    await waitFor(() => expect(mocks.settleOrder).toHaveBeenCalledWith("order-2", expect.objectContaining({
      payments: [expect.objectContaining({ paymentMethodId: "cash", amount: "8.4000" })],
    })));
    expect(mocks.settleOrder.mock.calls[0][1]).not.toHaveProperty("includeTax");
    expect(mocks.processCheckout).not.toHaveBeenCalled();
  });

  it("shows the server's subtotal and tax for a saved bill before any option is changed", async () => {
    render(<MemoryRouter initialEntries={["/cashier?view=pay"]}><CashierPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.fetchOrderBill).toHaveBeenCalledWith("order-1", {
      discount: "0.0000", includeTax: true, includeServiceCharge: true,
    }));
    await waitFor(() => expect(screen.getAllByText("cashier.breakdown.tax")[0].nextSibling).toHaveTextContent("+0.50"));
    for (const row of screen.getAllByText("cashier.breakdown.subtotal")) {
      expect(row.nextSibling).toHaveTextContent("10.00");
    }
  });

  it("blocks split and finance while a quote is pending but permits changing options and clears tenders", async () => {
    let resolveQuote!: (bill: Record<string, string>) => void;
    mocks.fetchOrderBill.mockImplementationOnce(() => new Promise((resolve) => { resolveQuote = resolve; }));
    render(<MemoryRouter initialEntries={["/cashier?view=pay"]}><CashierPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "cashier.payment.split" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "cashier.payment.addTender" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "cashier.payment.addTender" }));
    expect(screen.getByRole("button", { name: "cashier.orderPanel.remove" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeTax" }));

    expect(screen.queryByRole("button", { name: "cashier.orderPanel.remove" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cashier.payment.split" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cashier.printFinance" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cashier.confirmPay" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "cashier.payment.includeTax" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" }));
    await waitFor(() => expect(mocks.fetchOrderBill).toHaveBeenLastCalledWith("order-1", {
      discount: "0.0000", includeTax: false, includeServiceCharge: false,
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "cashier.confirmPay" })).toBeEnabled());
    await act(async () => resolveQuote({
      orderId: "order-1", subtotal: "999.0000", totalDiscount: "0.0000", totalTax: "999.0000",
      addedTax: "999.0000", serviceCharge: "999.0000", serviceChargeTax: "999.0000", grandTotal: "999.0000",
    }));
    expect(screen.queryByText("999.00")).not.toBeInTheDocument();
    expect(screen.getAllByText("10.00").length).toBeGreaterThan(0);
    expect(mocks.printReceipt).not.toHaveBeenCalled();
    expect(mocks.checkoutTableSession).not.toHaveBeenCalled();
  });

  it("blocks payment after an options quote fails", async () => {
    mocks.fetchOrderBill.mockRejectedValue(new Error("Offline"));
    render(<MemoryRouter initialEntries={["/cashier?view=pay"]}><CashierPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "cashier.payment.options" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cashier.payment.billOptionsError");
    expect(screen.getByRole("button", { name: "cashier.confirmPay" })).toBeDisabled();
    expect(mocks.checkoutTableSession).not.toHaveBeenCalled();
  });

  it("does not send or print order lines which were already sent to KDS", async () => {
    selectedOrderLinesState = [
      {
        ...orderLine,
        status: "FIRED",
        firedAt: "2026-10-23T10:00:00.000Z",
      },
    ];
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.sendKds" })
    );

    await waitFor(() =>
      expect(screen.getByText("cashier.errors.kdsNothingNew")).toBeInTheDocument()
    );
    expect(mocks.fireToKds).not.toHaveBeenCalled();
    expect(mocks.printKitchen).not.toHaveBeenCalled();
  });

  it("sends only the extra quantity added after an earlier KDS send", async () => {
    selectedOrderLinesState = [
      {
        ...orderLine,
        quantity: "5.0000",
        status: "FIRED",
        firedAt: "2026-10-23T10:00:00.000Z",
      },
      {
        ...orderLine,
        id: "line-2",
        quantity: "1.0000",
        status: "PENDING",
      },
    ];
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.sendKds" })
    );

    await waitFor(() =>
      expect(mocks.fireToKds).toHaveBeenCalledWith({ salesOrderId: "order-1" })
    );
    expect(mocks.printKitchen).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ name: "Coffee", quantity: "1.0000" })],
      }),
      expect.any(Array),
      { requireStationRouting: true }
    );
  });

  it("prints a DELETE slip on the station printer when a sent line is removed", async () => {
    selectedOrderLinesState = [
      {
        ...orderLine,
        status: "FIRED",
        firedAt: "2026-10-23T10:00:00.000Z",
        selectedModifiers: {
          "modifier-1": { name: "Oat milk", priceDelta: "1.5000" },
        },
      },
    ];
    mocks.listStations.mockResolvedValue({
      stations: [
        {
          id: "station-drinks",
          name: "Bar",
          printerIds: ["printer-bar"],
          routingRules: { categoryIds: ["cat-drinks"] },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.removeItem" })
    );

    await waitFor(() =>
      expect(mocks.printKitchen).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "cashier.orderPanel.kdsDeleteTitle",
          lines: [
            expect.objectContaining({
              name: "Coffee",
              modifiers: "Oat milk",
              modifierPrices: "1.5000",
              remarks: "cashier.orderPanel.kdsDeleteTitle",
            }),
          ],
        }),
        [expect.objectContaining({ id: "station-drinks" })],
        { requireStationRouting: true }
      )
    );
  });

  it("prints no DELETE slip when the shop turned them off", async () => {
    venueSettingsState = { ...venueSettingsState, kdsDeleteSlips: false };
    selectedOrderLinesState = [
      {
        ...orderLine,
        status: "FIRED",
        firedAt: "2026-10-23T10:00:00.000Z",
      },
    ];
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.removeItem" })
    );

    await waitFor(() =>
      expect(screen.getByText("cashier.orderPanel.itemRemoved")).toBeInTheDocument()
    );
    expect(mocks.printKitchen).not.toHaveBeenCalled();
  });

  it("prints a DELETE slip for sent lines when the order is cancelled", async () => {
    selectedOrderLinesState = [
      {
        ...orderLine,
        status: "FIRED",
        firedAt: "2026-10-23T10:00:00.000Z",
      },
    ];
    mocks.listStations.mockResolvedValue({
      stations: [
        {
          id: "station-drinks",
          name: "Bar",
          printerIds: ["printer-bar"],
          routingRules: { categoryIds: ["cat-drinks"] },
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.cancelOrder" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.confirmCancelOrder" })
    );

    await waitFor(() =>
      expect(mocks.printKitchen).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "cashier.orderPanel.kdsDeleteTitle",
          lines: [expect.objectContaining({ name: "Coffee" })],
        }),
        [expect.objectContaining({ id: "station-drinks" })],
        { requireStationRouting: true }
      )
    );
  });

  it("prints no DELETE slip for a line the kitchen never got", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=menu"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.removeItem" })
    );

    await waitFor(() =>
      expect(screen.getByText("cashier.orderPanel.itemRemoved")).toBeInTheDocument()
    );
    expect(mocks.printKitchen).not.toHaveBeenCalled();
    expect(mocks.listStations).not.toHaveBeenCalled();
  });

  it("refetches table status on an interval without waiting for a click", async () => {
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter initialEntries={["/cashier?view=orders"]}>
          <CashierPage />
        </MemoryRouter>
      );

      expect(mocks.refreshDiningTableStatus).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mocks.refreshDiningTableStatus).toHaveBeenCalledTimes(1);
      expect(mocks.refreshDiningTableStatus).toHaveBeenCalledWith("tables");
    } finally {
      vi.useRealTimers();
    }
  });

  it("connects table status and table-session state controls", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    expect(
      screen.queryByRole("button", { name: /cashier.status.paid/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cashier.status.all/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /cashier.billOptions.titleWithTable/ })
    );
    const tableStatusSelect = screen.getByLabelText("cashier.orderPanel.tableStatus");
    expect(
      within(tableStatusSelect).getByRole("option", {
        name: "cashier.orderPanel.tableStatuses.AVAILABLE",
      })
    ).toBeDisabled();

    // An open order keeps its table: neither guard lets it go available.
    fireEvent.change(tableStatusSelect, {
      target: { value: "AVAILABLE" },
    });
    expect(
      await screen.findByText("cashier.errors.tableAvailableWithMenu")
    ).toBeInTheDocument();
    expect(mocks.updateDiningTableStatus).not.toHaveBeenCalled();

    fireEvent.change(tableStatusSelect, {
      target: { value: "DIRTY" },
    });
    fireEvent.change(screen.getByLabelText("cashier.orderPanel.sessionState"), {
      target: { value: "SERVED" },
    });

    await waitFor(() => {
      expect(mocks.updateDiningTableStatus).toHaveBeenCalledWith(
        "table-1",
        "DIRTY"
      );
      expect(mocks.updateTableSessionState).toHaveBeenCalledWith("session-1", {
        sessionState: "SERVED",
      });
    });
  });

  it("opens a free table once when it is tapped twice", async () => {
    diningTablesState = [{ ...table, status: "AVAILABLE" }];
    tableSessionsState = [];
    let finishOpen: (value: typeof session) => void = () => {};
    mocks.openTableSession.mockImplementation(
      () => new Promise((resolve) => (finishOpen = resolve))
    );
    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    const tile = screen.getByRole("button", { name: /^T1/ });
    fireEvent.click(tile);
    fireEvent.click(tile);

    await waitFor(() => expect(mocks.openTableSession).toHaveBeenCalled());
    finishOpen(session);
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("cashier.productMenu.search")
      ).toBeInTheDocument();
    });
    expect(mocks.openTableSession).toHaveBeenCalledTimes(1);
  });

  it("opens an occupied table's existing order instead of creating a session", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /^T1/ }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("cashier.productMenu.search")
      ).toBeInTheDocument();
    });
    expect(mocks.openTableSession).not.toHaveBeenCalled();
    expect(mocks.updateDiningTableStatus).not.toHaveBeenCalled();
  });

  it("allows marking a table available when the order has no menu lines and is settled", async () => {
    selectedOrderLinesState = [];
    selectedOrderState = { ...order, status: "COMPLETED" };

    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /cashier.billOptions.titleWithTable/ })
    );
    const tableStatusSelect = screen.getByLabelText("cashier.orderPanel.tableStatus");
    expect(
      within(tableStatusSelect).getByRole("option", {
        name: "cashier.orderPanel.tableStatuses.AVAILABLE",
      })
    ).toBeEnabled();

    fireEvent.change(tableStatusSelect, { target: { value: "AVAILABLE" } });

    await waitFor(() =>
      expect(mocks.updateDiningTableStatus).toHaveBeenCalledWith(
        "table-1",
        "AVAILABLE"
      )
    );
  });

  it("blocks marking a table available while its order is still open", async () => {
    selectedOrderLinesState = [];

    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /cashier.billOptions.titleWithTable/ })
    );
    fireEvent.change(screen.getByLabelText("cashier.orderPanel.tableStatus"), {
      target: { value: "AVAILABLE" },
    });

    expect(
      await screen.findByText("cashier.errors.tableHasActiveOrder")
    ).toBeInTheDocument();
    expect(mocks.updateDiningTableStatus).not.toHaveBeenCalled();
  });

  it("voids a paid sale only after a manager signs it off", async () => {
    selectedOrderState = { ...order, status: "COMPLETED" };
    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.cancelOrder" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.confirmCancelOrder" }));

    expect(await screen.findByText("cashier.voidApproval.title")).toBeInTheDocument();
    expect(mocks.voidCheckout).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("shift.managerId"), { target: { value: "MGR0001" } });
    fireEvent.change(screen.getByLabelText("shift.managerPassword"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "cashier.voidApproval.confirm" }));

    await waitFor(() =>
      expect(mocks.voidCheckout).toHaveBeenCalledWith("order-1", "approval-token")
    );
    expect(mocks.approve).toHaveBeenCalledWith("MGR0001", "secret", "sales:refund:approve");
  });

  it("cancels an unpaid order without calling checkout void", async () => {
    render(
      <MemoryRouter initialEntries={["/cashier?view=orders"]}>
        <CashierPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.cancelOrder" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.confirmCancelOrder" })
    );

    await waitFor(() => {
      expect(mocks.updateManagedOrder).toHaveBeenCalledWith("order-1", {
        status: "VOIDED",
      });
      expect(mocks.voidCheckout).not.toHaveBeenCalled();
      expect(mocks.updateTableSessionState).toHaveBeenCalledWith("session-1", {
        sessionState: "CLOSED",
      });
      expect(mocks.updateDiningTableStatus).toHaveBeenCalledWith(
        "table-1",
        "AVAILABLE"
      );
    });
  });

  describe("table charges", () => {
    const poolClock = {
      variantId: "variant-pool",
      name: "Pool table",
      unitPrice: 3000,
      soldBy: "TIME",
      timeBlockMinutes: 30,
      minimumBlocks: 1,
      chargeMode: "CLOCK",
      autoApply: false,
    };

    it("starts a pool table clock from the table's menu", async () => {
      tableChargesState = { offered: [poolClock], running: [] };
      render(
        <MemoryRouter initialEntries={["/cashier?view=menu"]}>
          <CashierPage />
        </MemoryRouter>
      );

      expect(screen.getByText("cashier.tableCharges.title")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Pool table/ }));

      await waitFor(() => expect(mocks.addTableCharge).toHaveBeenCalledWith("variant-pool", 1));
      await waitFor(() => expect(mocks.selectOrderById).toHaveBeenCalledWith("order-1"));
    });

    it("bills a running clock before taking payment", async () => {
      tableChargesState = {
        offered: [poolClock],
        running: [{ variantId: "variant-pool", name: "Pool table", startedAt: "2026-10-07T12:00:00Z" }],
      };
      render(
        <MemoryRouter initialEntries={["/cashier?view=menu"]}>
          <CashierPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: "cashier.payNow" }));

      await waitFor(() => expect(mocks.stopTableCharges).toHaveBeenCalledWith());
      await waitFor(() => expect(mocks.selectOrderById).toHaveBeenCalledWith("order-1"));
    });

    it("syncs a running table charge when the pay route is opened directly", async () => {
      tableChargesLoadedState = true;
      tableChargesState = {
        offered: [poolClock],
        running: [
          {
            variantId: "variant-pool",
            name: "Pool table",
            startedAt: "2026-10-07T12:00:00Z",
          },
        ],
      };
      render(
        <MemoryRouter initialEntries={["/cashier?view=pay"]}>
          <CashierPage />
        </MemoryRouter>
      );

      await waitFor(() => expect(mocks.stopTableCharges).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mocks.selectOrderById).toHaveBeenCalledWith("order-1"));
    });

    it("refreshes table charges on confirm and does not submit a stale payment total", async () => {
      tableChargesState = {
        offered: [poolClock],
        running: [
          {
            variantId: "variant-pool",
            name: "Pool table",
            startedAt: "2026-10-07T12:00:00Z",
          },
        ],
      };
      mocks.selectOrderById.mockResolvedValueOnce({
        ...order,
        grandTotal: "12.0000",
      });
      render(
        <MemoryRouter initialEntries={["/cashier?view=pay"]}>
          <CashierPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.stopTableCharges).toHaveBeenCalledWith());
      await waitFor(() => expect(mocks.selectOrderById).toHaveBeenCalledWith("order-1"));
      expect(mocks.checkoutTableSession).not.toHaveBeenCalled();
      expect(await screen.findByText("cashier.errors.billUpdated")).toBeInTheDocument();
    });

    it("does not add the local service charge to the refreshed server grand total again", async () => {
      mocks.selectOrderById.mockResolvedValueOnce({
        ...order,
        grandTotal: "10.5000",
      });
      render(
        <MemoryRouter initialEntries={["/cashier?view=pay"]}>
          <CashierPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.checkoutTableSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          payments: [{ paymentMethodId: "cash", amount: "10.5000" }],
        })
      ));
      expect(mocks.stopTableCharges).not.toHaveBeenCalled();
      expect(screen.queryByText("cashier.errors.billUpdated")).not.toBeInTheDocument();
    });

    it("uses the server-required total when checkout detects a later bill change", async () => {
      mocks.checkoutTableSession.mockRejectedValueOnce(
        new Error("Insufficient payment: required 12.2500, received 10.5000")
      );
      render(
        <MemoryRouter initialEntries={["/cashier?view=pay"]}>
          <CashierPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.checkoutTableSession).toHaveBeenCalled());
      expect(await screen.findByText("cashier.errors.billUpdated")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "cashier.confirmPay" }));

      await waitFor(() => expect(mocks.checkoutTableSession).toHaveBeenCalledTimes(2));
      expect(mocks.checkoutTableSession).toHaveBeenLastCalledWith(
        "session-1",
        expect.objectContaining({
          payments: [{ paymentMethodId: "cash", amount: "12.2500" }],
        })
      );
    });

    it("keeps room charges and other areas' products off the restaurant menu", () => {
      render(
        <MemoryRouter initialEntries={["/cashier?view=menu"]}>
          <CashierPage />
        </MemoryRouter>
      );
      expect(screen.queryByRole("button", { name: /VIP room fee/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Spa tea/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Coffee/ })).toBeInTheDocument();
    });
  });
});
