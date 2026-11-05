import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabletItemDialog } from "../TabletItemDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { amount?: string; name?: string }) =>
      options?.amount ? `${key}:${options.amount}` : options?.name ? `${key}:${options.name}` : key,
  }),
}));

const beer = {
  variantId: "beer",
  name: "Myanmar Beer",
  price: "3500.0000",
  imageUrl: null,
  modifierGroups: [
    {
      id: "ice",
      name: "Ice",
      minSelection: 1,
      maxSelection: 1,
      isRequired: true,
      modifiers: [
        { id: "normal", name: "Normal", priceDelta: "0", isDefault: false },
        { id: "extra", name: "Extra ice", priceDelta: "500.0000", isDefault: false },
      ],
    },
  ],
};

describe("TabletItemDialog", () => {
  it("asks for a required choice, then adds the item with its options, note and count", () => {
    const onAdd = vi.fn();
    render(<TabletItemDialog item={beer} quickNotes={["Cold glass"]} onAdd={onAdd} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /tablet.addItem/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("cashier.productMenu.pickFrom:Ice");
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Extra ice/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cold glass" }));
    fireEvent.click(screen.getByRole("button", { name: "tablet.more" }));
    fireEvent.click(screen.getByRole("button", { name: "tablet.addItem:8,000" }));

    expect(onAdd).toHaveBeenCalledWith({
      modifiers: [{ modifierId: "extra", name: "Extra ice", priceDelta: "500.0000" }],
      note: "Cold glass",
      quantity: 2,
    });
  });
});
