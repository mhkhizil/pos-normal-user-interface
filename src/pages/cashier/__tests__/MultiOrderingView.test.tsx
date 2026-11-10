import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiOrderingView } from "../MultiOrderingView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "cashier.multiOrder.orderNumber"
        ? `Order ${options?.number}`
        : key,
  }),
}));

const orders = [
  {
    id: "order-1",
    orderNumber: "SO-1",
    status: "DRAFT",
  },
  {
    id: "order-2",
    orderNumber: "SO-2",
    status: "DRAFT",
  },
] as never;

const linesByOrderId = {
  "order-1": [
    {
      id: "line-1",
      salesOrderId: "order-1",
      variantId: "variant-1",
      quantity: "1.0000",
      unitPrice: "10.0000",
      productName: "Fish Ball Stick",
      variantName: "Large",
    },
  ],
  "order-2": [],
};

describe("MultiOrderingView", () => {
  it("supports selecting, merging, adding, and opening orders", () => {
    const onSelectionChange = vi.fn();
    const onMergeAll = vi.fn();
    const onAddOrder = vi.fn();
    const onOpenOrder = vi.fn();

    render(
      <MultiOrderingView
        tableLabel="Table T1"
        orderIds={["order-1", "order-2"]}
        orders={orders}
        linesByOrderId={linesByOrderId}
        activeOrderId="order-1"
        selectedOrderIds={[]}
        onBack={vi.fn()}
        onOpenOrder={onOpenOrder}
        onAddOrder={onAddOrder}
        onSelectionChange={onSelectionChange}
        onMergeAll={onMergeAll}
        onMergeSelected={vi.fn()}
        onSplitItems={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getAllByLabelText("cashier.multiOrder.selectOrder")[1]
    );
    expect(onSelectionChange).toHaveBeenCalledWith(["order-2"]);

    fireEvent.click(
      screen.getByRole("button", { name: "cashier.multiOrder.mergeAll" })
    );
    expect(onMergeAll).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: /cashier\.multiOrder\.new$/ })
    );
    expect(onAddOrder).toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "cashier.multiOrder.details",
      })[0]
    );
    expect(onOpenOrder).toHaveBeenCalledWith("order-1");

    // Each line reads as its item, with the variant under it.
    expect(screen.getByText("Fish Ball Stick (Large)")).toBeInTheDocument();
  });
});
