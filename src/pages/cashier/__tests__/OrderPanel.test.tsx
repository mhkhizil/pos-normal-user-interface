import { createRef, type ComponentProps } from "react";
import { fireEvent, render as mount, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiningTable, PaymentMethod, SalesOrder, SalesOrderLine, TableSession } from "@/core/domain/entities/Cashier";
import type { RunningPromotion } from "@/core/domain/entities/Promotion";
import { groupOrderLines, OrderPanel } from "../OrderPanel";

vi.mock("@/core/presentation/hooks/useWorkingHostesses", () => ({
  useWorkingHostesses: () => ({ hostesses: [], isLoading: false, error: null, loadedAt: null, load: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const paidOrder = new SalesOrder({
  id: "order-1",
  tenantId: "t1",
  locationId: "loc-1",
  orderNumber: "SO-180",
  salesChannel: "POS",
  serviceType: "TAKE_AWAY",
  status: "COMPLETED",
  subtotal: "10.0000",
  totalDiscount: "0.0000",
  totalTax: "0.0000",
  grandTotal: "10.0000",
  createdAt: "",
  updatedAt: "",
});

const line = new SalesOrderLine({
  id: "line-1",
  salesOrderId: "order-1",
  variantId: "variant-1",
  quantity: "1.0000",
  unitPrice: "10.0000",
});

/** The bill row of the default line, named after its variant id. */
const row = (name = "variant-") => {
  const group = screen.getByRole("group", { name });
  const toggle = within(group).getByRole("button", {
    name: /cashier\.orderPanel\.lineDetails/,
  });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  return group;
};

/** Opens every bill row: the panel keeps each row's details collapsed. */
const openRows = () => {
  for (const toggle of screen.queryAllByRole("button", {
    name: /cashier\.orderPanel\.lineDetails/,
  })) {
    if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  }
};

/** Renders the panel with the bill rows open, as the cashier would tap them. */
const render = (ui: Parameters<typeof mount>[0]) => {
  const result = mount(ui);
  openRows();
  return result;
};

const defaultProps: ComponentProps<typeof OrderPanel> = {
  selectedOrder: paidOrder,
  selectedOrderLines: [line],
  products: [],
  variantsByProductId: {},
  paymentMethods: [new PaymentMethod({ id: "cash", name: "Cash" })],
  paymentMethodId: "cash",
  paymentAmount: "10.0000",
  total: "10.0000",
  selectedTable: null,
  selectedSession: null,
  paymentInputRef: createRef<HTMLInputElement>(),
  isLoading: false,
  onCreateOrder: vi.fn(),
  onIncreaseLineQuantity: vi.fn(),
  onDecreaseLineQuantity: vi.fn(),
  onRemoveLine: vi.fn(),
  onPaymentAmountChange: vi.fn(),
  onPaymentMethodChange: vi.fn(),
  onOpenPay: vi.fn(),
  onCheckout: vi.fn(),
  onFireKds: vi.fn(),
  onPickup: vi.fn(),
  onTableStatusChange: vi.fn(),
  onSessionStateChange: vi.fn(),
};

const promotion: RunningPromotion = {
  id: "promo-1",
  name: "Special Menu",
  discountType: "PERCENT_OFF",
  discountValue: 10,
  buyUnits: null,
  freeUnits: null,
  appliesTo: "ALL_ITEMS",
  productGroups: [],
  variantIds: [],
  priorityLevel: 0,
};

describe("OrderPanel", () => {
  it("keeps a bill row compact until the cashier opens it", () => {
    mount(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({ ...line, productName: "Coffee", quantity: "2.0000" }),
        ]}
        onEditLine={vi.fn()}
      />
    );

    const coffee = screen.getByRole("group", { name: "Coffee" });
    const toggle = within(coffee).getByRole("button", {
      name: /cashier\.orderPanel\.lineDetails/,
    });
    // Like a bill: the row says what and how much, and the rest opens on a tap.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(coffee).toHaveTextContent("2×");
    expect(coffee).toHaveTextContent("20.00");
    expect(
      within(coffee).queryByLabelText("cashier.orderPanel.lineQuantity")
    ).toBeNull();
    expect(
      within(coffee).queryByRole("button", {
        name: "cashier.orderPanel.removeItem",
      })
    ).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(coffee).toHaveTextContent("@ 10.00");
    expect(
      within(coffee).getByLabelText("cashier.orderPanel.lineQuantity")
    ).toHaveTextContent("2");
    expect(
      within(coffee).getByRole("button", {
        name: "cashier.orderPanel.removeItem",
      })
    ).toBeEnabled();
  });

  it("keeps table controls compact until the cashier expands them", () => {
    const onChangeTable = vi.fn();
    const onCombineTables = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedTable={
          new DiningTable({
            id: "table-1",
            tableNumber: "T-05",
            status: "OCCUPIED",
          })
        }
        selectedSession={
          new TableSession({
            id: "session-1",
            tableId: "table-1",
            salesOrderId: "order-1",
            sessionState: "ORDERING",
          })
        }
        hasActiveTableOrder
        onChangeTable={onChangeTable}
        onCombineTables={onCombineTables}
      />
    );

    const options = screen.getByRole("button", { name: /cashier.billOptions.titleWithTable/ });
    expect(options).toHaveTextContent("T-05");
    expect(options).toHaveTextContent("cashier.orderPanel.sessionStates.ORDERING");
    expect(screen.queryByLabelText("cashier.orderPanel.tableStatus")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "cashier.seating.changeTable" })).not.toBeInTheDocument();

    fireEvent.click(options);

    const dialog = screen.getByRole("dialog", { name: "cashier.billOptions.titleWithTable" });
    expect(within(dialog).getByText("cashier.billOptions.table T-05")).toBeInTheDocument();
    const tableStatusSelect = within(dialog).getByLabelText("cashier.orderPanel.tableStatus");
    expect(tableStatusSelect).toBeInTheDocument();
    // A table holding an open order is never offered as available.
    expect(
      within(tableStatusSelect).getByRole("option", {
        name: "cashier.orderPanel.tableStatuses.AVAILABLE",
      })
    ).toBeDisabled();
    expect(within(dialog).getByLabelText("cashier.orderPanel.sessionState")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "cashier.seating.changeTable" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "cashier.seating.combine" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "cashier.seating.split" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "cashier.billOptions.done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // A row shows the item's own price: tax is a bill-level row in the breakdown,
  // so it is neither added to nor taken out of one line's amount.
  it.each([true, false])(
    "shows the item price without its tax when taxInclusive=%s",
    (taxInclusive) => {
      render(
        <OrderPanel {...defaultProps}
          selectedOrderLines={[new SalesOrderLine({ ...line, taxAmount: "1.0000", taxInclusive })]} />
      );
      const group = row();
      // The unit price is 10.00; 11.00 would mean tax was added to the row and
      // 9.00 that it was taken out of it.
      expect(group).toHaveTextContent("10.00");
      expect(group).not.toHaveTextContent("11.00");
      expect(group).not.toHaveTextContent("9.00");
    }
  );

  it("uses bill-priced lines for display without changing action payloads", () => {
    const onRemoveLine = vi.fn();
    render(<OrderPanel {...defaultProps}
      selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
      billLines={[new SalesOrderLine({ ...line, lineDiscount: "2.0000" })]}
      onRemoveLine={onRemoveLine} />);
    expect(row()).toHaveTextContent("8.00");
    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.removeItem" }));
    expect(onRemoveLine).toHaveBeenCalledWith(line);
  });

  it("shows one combined row while keeping post-KDS additions pending", () => {
    const onRemoveLine = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({
            ...line,
            productName: "Cola",
            quantity: "2.0000",
            status: "FIRED",
          }),
          new SalesOrderLine({
            ...line,
            id: "line-2",
            productName: "Cola",
            quantity: "1.0000",
            status: "PENDING",
          }),
        ]}
        onRemoveLine={onRemoveLine}
      />
    );

    expect(row("Cola")).toHaveTextContent("30.00");
    expect(screen.getByLabelText("cashier.orderPanel.lineQuantity")).toHaveTextContent("3");
    expect(screen.getByLabelText("cashier.orderPanel.kdsPending")).toHaveClass(
      "bg-emerald-500"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.removeItem" })
    );
    expect(onRemoveLine).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "line-2",
        quantity: "3.0000",
        groupedLineIds: ["line-1", "line-2"],
      })
    );
  });

  it("combines promotion-split rows of the same item", () => {
    const grouped = groupOrderLines([
      new SalesOrderLine({ ...line, quantity: "1.0000", lineDiscount: "1000.0000" }),
      new SalesOrderLine({
        ...line,
        id: "line-2",
        quantity: "1.0000",
        lineDiscount: "10000.0000",
        appliedPromotionId: "promo-1",
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      quantity: "2.0000",
      groupedLineIds: ["line-1", "line-2"],
    });
  });

  it("blocks finance printing while a bill quote is unavailable", () => {
    render(<OrderPanel {...defaultProps} isPayView checkoutBlocked onPrintFinance={vi.fn()} />);
    expect(screen.getByRole("button", { name: "cashier.printFinance" })).toBeDisabled();
  });

  it("marks pending KDS lines green and hides the marker after they are sent", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({ ...line, productName: "Pending coffee" }),
          new SalesOrderLine({
            ...line,
            id: "line-sent",
            variantId: "variant-2",
            productName: "Sent coffee",
            firedAt: "2026-10-28T10:00:00.000Z",
          }),
        ]}
      />
    );

    expect(screen.getByLabelText("cashier.orderPanel.kdsPending")).toHaveClass(
      "bg-emerald-500"
    );
    expect(screen.getAllByLabelText("cashier.orderPanel.kdsPending")).toHaveLength(1);
  });

  it("shows the price, variant and actions on the row itself", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({ ...line, productName: "Coffee", variantName: "Large", quantity: "2.0000" }),
        ]}
        onEditLine={vi.fn()}
      />
    );

    const coffee = row("Coffee");
    expect(coffee).toHaveTextContent("@ 10.00");
    expect(coffee).toHaveTextContent("Large");
    expect(coffee).toHaveTextContent("20.00");
    expect(within(coffee).getByLabelText("cashier.orderPanel.lineQuantity")).toHaveTextContent("2");
    for (const action of ["decreaseQuantity", "increaseQuantity", "editItem", "removeItem"]) {
      expect(within(coffee).getByRole("button", { name: `cashier.orderPanel.${action}` })).toBeEnabled();
    }
  });

  it("closes the edit box when the cashier switches orders", () => {
    const props = {
      ...defaultProps,
      selectedOrder: new SalesOrder({ ...paidOrder, status: "DRAFT" }),
      onEditLine: vi.fn(),
    };
    const { rerender } = render(<OrderPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    expect(screen.getByRole("dialog", { name: "cashier.lineEdit.title" })).toBeInTheDocument();

    rerender(<OrderPanel {...props} selectedOrder={new SalesOrder({ ...props.selectedOrder, id: "order-2" })} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("runs the row actions on the line", () => {
    const onIncreaseLineQuantity = vi.fn();
    const onDecreaseLineQuantity = vi.fn();
    const onRemoveLine = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        onIncreaseLineQuantity={onIncreaseLineQuantity}
        onDecreaseLineQuantity={onDecreaseLineQuantity}
        onRemoveLine={onRemoveLine}
      />
    );

    for (const action of ["increaseQuantity", "decreaseQuantity", "removeItem"]) {
      fireEvent.click(screen.getByRole("button", { name: `cashier.orderPanel.${action}` }));
    }
    for (const callback of [onIncreaseLineQuantity, onDecreaseLineQuantity, onRemoveLine]) {
      expect(callback).toHaveBeenCalledExactlyOnceWith(line);
    }
  });

  it.each([{ isLoading: true }, { selectedOrder: paidOrder }])("keeps line actions disabled for %j", (overrides) => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        onEditLine={vi.fn()}
        {...overrides}
      />
    );
    for (const action of ["increaseQuantity", "decreaseQuantity", "editItem", "removeItem"]) {
      expect(screen.getByRole("button", { name: `cashier.orderPanel.${action}` })).toBeDisabled();
    }
  });

  it("does not allow paying a completed takeaway order again", () => {
    const onOpenPay = vi.fn();
    const onCheckout = vi.fn();

    render(
      <OrderPanel
        {...defaultProps}
        onOpenPay={onOpenPay}
        onCheckout={onCheckout}
      />
    );

    expect(screen.getByRole("button", { name: "cashier.payNow" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "cashier.payNow" }));
    expect(onOpenPay).not.toHaveBeenCalled();
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it("keeps Pay disabled until a table is assigned", () => {
    const onOpenPay = vi.fn();
    const onCheckout = vi.fn();

    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedTable={null}
        requiresTableAssignment
        onOpenPay={onOpenPay}
        onCheckout={onCheckout}
      />
    );

    const payButton = screen.getByRole("button", { name: "cashier.payNow" });
    expect(payButton).toBeDisabled();
    fireEvent.click(payButton);
    expect(onOpenPay).not.toHaveBeenCalled();
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it("confirms cancel order before voiding and releasing a table", () => {
    const onCancelOrder = vi.fn();

    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedTable={
          new DiningTable({
            id: "table-1",
            tableNumber: "T-02",
            status: "OCCUPIED",
          })
        }
        onCancelOrder={onCancelOrder}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.cancelOrder" })
    );
    expect(onCancelOrder).not.toHaveBeenCalled();
    expect(
      screen.getByText("cashier.orderPanel.cancelOrderConfirmTable")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.confirmCancelOrder" })
    );
    expect(onCancelOrder).toHaveBeenCalledTimes(1);
  });

  it("lets cashiers edit checkout adjustments and mark a line FOC", () => {
    const onDiscountAmountChange = vi.fn();
    const onRemoveDiscount = vi.fn();
    const onEditLine = vi.fn();

    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        discountAmount="5.0000"
        discountReasons={[]}
        serviceCharge="0.0000"
        tipAmount="0.0000"
        onDiscountAmountChange={onDiscountAmountChange}
        onDiscountReasonChange={vi.fn()}
        onRemoveDiscount={onRemoveDiscount}
        onServiceChargeChange={vi.fn()}
        onTipAmountChange={vi.fn()}
        onMemberCardUidChange={vi.fn()}
        onLookupMemberCard={vi.fn()}
        onEditLine={onEditLine}
      />
    );

    const options = screen.getByRole("button", { name: /cashier.billOptions.title/ });
    expect(options).toHaveTextContent("−5.00");
    fireEvent.click(options);
    expect(screen.getByText("cashier.billOptions.bill")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("cashier.orderPanel.discount"), {
      target: { value: "8.0000" },
    });
    expect(onDiscountAmountChange).toHaveBeenCalledWith("8.0000");
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.removeDiscount" })
    );
    expect(onRemoveDiscount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "cashier.billOptions.done" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    fireEvent.click(screen.getByRole("switch", { name: "cashier.lineEdit.foc" }));
    fireEvent.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));
    expect(onEditLine).toHaveBeenCalledExactlyOnceWith(line, { quantity: 1, unitPrice: 10, foc: true });
  });

  it("keeps the bill options out of the panel until the cashier opens them", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        discountAmount="0.0000"
        discountReasons={[]}
        serviceCharge="0.0000"
        tipAmount="0.0000"
        memberCardUid=""
        onDiscountAmountChange={vi.fn()}
        onDiscountReasonChange={vi.fn()}
        onRemoveDiscount={vi.fn()}
        onServiceChargeChange={vi.fn()}
        onTipAmountChange={vi.fn()}
        onMemberCardUidChange={vi.fn()}
        onLookupMemberCard={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("cashier.orderPanel.discount")).not.toBeInTheDocument();
    const options = screen.getByRole("button", { name: "cashier.billOptions.title" });
    expect(options.parentElement).toContainElement(
      screen.getByRole("button", { name: "cashier.orderPanel.sendKds" })
    );

    fireEvent.click(options);
    expect(screen.getByLabelText("cashier.orderPanel.discount")).toBeInTheDocument();
    expect(screen.queryByText("cashier.billOptions.table")).not.toBeInTheDocument();
  });

  it("starts the discount and tip boxes empty so typed amounts are not added after 0.0000", async () => {
    const user = userEvent.setup();
    const onDiscountAmountChange = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        discountAmount="0.0000"
        tipAmount="0.0000"
        onDiscountAmountChange={onDiscountAmountChange}
        onTipAmountChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /cashier.billOptions.title/ }));
    const discount = screen.getByLabelText("cashier.orderPanel.discount");
    expect(discount).toHaveValue("");
    expect(discount).toHaveAttribute("placeholder", "0");
    expect(screen.getByLabelText("cashier.orderPanel.tip")).toHaveValue("");
    await user.type(discount, "5");
    expect(onDiscountAmountChange).toHaveBeenLastCalledWith("5");
  });

  it("chooses tax and service charge for the bill from Bill options", () => {
    const onChange = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        onDiscountAmountChange={vi.fn()}
        onTipAmountChange={vi.fn()}
        chargeOptions={{ includeTax: false, includeServiceCharge: true, onChange }}
      />
    );

    const options = screen.getByRole("button", { name: /cashier.billOptions.title/ });
    expect(options).toHaveTextContent("cashier.billOptions.noTax");
    expect(options).not.toHaveTextContent("cashier.billOptions.noServiceCharge");
    fireEvent.click(options);
    const tax = screen.getByRole("checkbox", { name: "cashier.payment.includeTax" });
    expect(tax).not.toBeChecked();
    fireEvent.click(tax);
    expect(onChange).toHaveBeenCalledWith("includeTax", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "cashier.payment.includeServiceCharge" }));
    expect(onChange).toHaveBeenCalledWith("includeServiceCharge", false);
  });

  it("shows the promotions running and the discount the server already took", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({
            ...line,
            appliedPromotionId: "promo-1",
            lineDiscount: "1.0000",
          }),
        ]}
        promotions={[promotion]}
        promotionName={(id) => (id === "promo-1" ? "Special Menu" : undefined)}
        onEditLine={vi.fn()}
      />
    );

    expect(screen.getByText("cashier.orderPanel.promotionsNow")).toBeInTheDocument();
    expect(screen.getByText("Special Menu (10%)")).toBeInTheDocument();
    expect(screen.getByText("cashier.orderPanel.promo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    expect(screen.getByText("cashier.orderPanel.promoSaving")).toBeInTheDocument();
    expect(screen.getByText("cashier.orderPanel.promotionDiscount")).toBeInTheDocument();
    expect(screen.getByText("−1.00")).toBeInTheDocument();
    // The promotion is inside the line: 10.00 charged, 1.00 off.
    expect(screen.getByText("9.00")).toBeInTheDocument();
  });

  it("previews the saving on a line the server has not priced yet", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[line]}
        promotions={[promotion]}
        promotionDiscounts={{ "variant-1": { discount: 1, names: ["Special Menu"] } }}
        onEditLine={vi.fn()}
      />
    );

    expect(screen.getByText("cashier.orderPanel.promo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    expect(screen.getByText("cashier.orderPanel.promoSaving")).toBeInTheDocument();
    // 10.00 on the line, 1.00 of promotion still to come off.
    expect(screen.getByText("9.00")).toBeInTheDocument();
    // Nothing is on the bill yet, so the total carries no discount row.
    expect(
      screen.queryByText("cashier.orderPanel.promotionDiscount")
    ).not.toBeInTheDocument();
  });

  it("tags extra fees, keeps differently named ones apart, and opens the fee picker", async () => {
    const onAddExtraFee = vi.fn();
    const fee = (id: string, productName: string) =>
      new SalesOrderLine({
        ...line,
        id,
        variantId: "fee-other",
        unitPrice: "200.0000",
        productName,
      });
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[fee("a", "Paper bag"), fee("b", "Delivery")]}
        isFeeLine={(entry) => entry.variantId === "fee-other"}
        onAddExtraFee={onAddExtraFee}
      />
    );

    expect(screen.getByText("Paper bag")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getAllByText("cashier.extraFee.tag")).toHaveLength(2);
    expect(screen.queryByLabelText("cashier.orderPanel.kdsPending")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cashier.extraFee.button/ }));
    expect(onAddExtraFee).toHaveBeenCalled();
  });

  it("offers no extra fee on a paid bill", () => {
    render(<OrderPanel {...defaultProps} onAddExtraFee={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /cashier.extraFee.button/ })).not.toBeInTheDocument();
  });

  it("names a line from the order itself, not from the menu it has loaded", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({
            ...line,
            variantId: "variant-not-loaded",
            productName: "Fish Ball Stick",
          }),
        ]}
      />
    );

    expect(screen.getByText("Fish Ball Stick")).toBeInTheDocument();
  });

  it("shows the line's variant under the product name", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[
          new SalesOrderLine({
            ...line,
            productName: "Coffee",
            variantName: "Large",
          }),
        ]}
      />
    );

    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(row("Coffee")).toHaveTextContent("Large");
  });

  it("shows money with two decimals", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        total="2600.0000"
        selectedOrderLines={[
          new SalesOrderLine({ ...line, unitPrice: "2600.0000", quantity: "1.0000" }),
        ]}
      />
    );

    // The line price, what the line costs and the total, never four decimals.
    expect(screen.getAllByText("2,600.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("2600.0000")).not.toBeInTheDocument();
  });

  it("names the variant from the menu when the line carries only an id", () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        products={[]}
        variantsByProductId={{
          "product-1": [
            {
              id: "variant-1",
              productId: "product-1",
              variantSku: "COFFEE-LARGE",
              matrixOptions: { size: "Large" },
            } as never,
          ],
        }}
      />
    );

    expect(row("COFFEE-LARGE")).toHaveTextContent("Large");
  });

  it("changes a line's price for this bill only", async () => {
    const user = userEvent.setup();
    const onEditLine = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[new SalesOrderLine({ ...line, quantity: "2.0000" })]}
        onEditLine={onEditLine}
        menuPrice={() => 10}
      />
    );

    await user.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    const dialog = screen.getByRole("dialog", { name: "cashier.lineEdit.title" });
    const input = within(dialog).getByLabelText("cashier.lineEdit.price");
    await user.clear(input);
    await user.type(input, "7.5");
    expect(dialog).toHaveTextContent("15.00");
    await user.click(within(dialog).getByRole("button", { name: "cashier.lineEdit.save" }));

    expect(onEditLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1" }),
      { quantity: 2, unitPrice: 7.5, foc: false }
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks a changed price and offers the menu price back", async () => {
    const user = userEvent.setup();
    const onEditLine = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[new SalesOrderLine({ ...line, unitPrice: "8.0000" })]}
        onEditLine={onEditLine}
        menuPrice={() => 10}
      />
    );

    expect(row("cashier.orderPanel.priceNote.discount")).toHaveTextContent("8.00");
    await user.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    await user.click(screen.getByRole("button", { name: "cashier.lineEdit.menuPrice" }));
    await user.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));

    expect(onEditLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1" }),
      { quantity: 1, unitPrice: 10, foc: false }
    );
  });

  it("prices part of an item on its own", async () => {
    const user = userEvent.setup();
    const onEditLine = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        selectedOrderLines={[new SalesOrderLine({ ...line, quantity: "4.0000", unitPrice: "2000.0000" })]}
        onEditLine={onEditLine}
        menuPrice={() => 2000}
      />
    );

    await user.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    const dialog = screen.getByRole("dialog", { name: "cashier.lineEdit.title" });
    expect(within(dialog).getByLabelText("cashier.lineEdit.howMany")).toHaveTextContent("4");
    for (let i = 0; i < 3; i += 1) {
      await user.click(within(dialog).getByRole("button", { name: "cashier.orderPanel.decreaseQuantity" }));
    }
    const input = within(dialog).getByLabelText("cashier.lineEdit.price");
    await user.clear(input);
    await user.type(input, "1500");
    expect(dialog).toHaveTextContent("1,500.00");
    expect(within(dialog).getByText("cashier.lineEdit.restStay")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "cashier.lineEdit.save" }));

    expect(onEditLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1" }),
      { quantity: 1, unitPrice: 1500, foc: false }
    );
  });

  it("refuses an empty price and removes the item from the edit box", async () => {
    const user = userEvent.setup();
    const onEditLine = vi.fn();
    const onRemoveLine = vi.fn();
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        onEditLine={onEditLine}
        onRemoveLine={onRemoveLine}
      />
    );

    await user.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    await user.clear(screen.getByLabelText("cashier.lineEdit.price"));
    await user.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));
    expect(screen.getByText("cashier.lineEdit.priceRequired")).toBeInTheDocument();
    expect(onEditLine).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "cashier.lineEdit.remove" }));
    expect(onRemoveLine).toHaveBeenCalledExactlyOnceWith(line);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps an extra fee's amount out of the edit box", async () => {
    render(
      <OrderPanel
        {...defaultProps}
        selectedOrder={new SalesOrder({ ...paidOrder, status: "DRAFT" })}
        isFeeLine={() => true}
        onEditLine={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "cashier.orderPanel.editItem" }));
    expect(screen.queryByLabelText("cashier.lineEdit.price")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("cashier.lineEdit.howMany")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "cashier.lineEdit.foc" })).toBeInTheDocument();
  });
});
