import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Product, ProductVariant } from "@/core/domain/entities/Cashier";
import { ProductMenu } from "../ProductMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const coffee = new Product({
  id: "product-1",
  tenantId: "t1",
  name: "Coffee",
  basePrice: "10.0000",
  baseSku: "COFFEE",
  imageUrl: "https://cdn.example.com/coffee.jpg",
});

const soup = new Product({
  id: "product-2",
  tenantId: "t1",
  name: "Deli Soup",
  basePrice: "8.0000",
  baseSku: "SOUP",
});

const coffeeVariant = new ProductVariant({
  id: "variant-1",
  productId: "product-1",
  variantSku: "COFFEE",
});

const soupSmall = new ProductVariant({
  id: "variant-s",
  productId: "product-2",
  variantSku: "SOUP-S",
});

const soupLarge = new ProductVariant({
  id: "variant-l",
  productId: "product-2",
  variantSku: "SOUP-L",
});

describe("ProductMenu", () => {
  it("names each variant by its options and shows what it costs", async () => {
    const small = new ProductVariant({
      id: "beer-s",
      productId: "product-2",
      variantSku: "BEER-S",
      matrixOptions: { size: "Small" },
    });
    const large = new ProductVariant({
      id: "beer-l",
      productId: "product-2",
      variantSku: "BEER-L",
      matrixOptions: { size: "Large" },
      priceModifier: "2.5000",
    });
    render(
      <ProductMenu
        products={[soup]}
        variantsByProductId={{ "product-2": [small, large] }}
        onLoadVariants={vi.fn().mockResolvedValue([small, large])}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Deli Soup/ }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Small 8.00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Large 10.50" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /BEER-L/ })).not.toBeInTheDocument();
  });

  it("adds a single-variant product to the order on one click", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onLoadVariants = vi.fn().mockResolvedValue([coffeeVariant]);

    render(
      <ProductMenu
        products={[coffee]}
        variantsByProductId={{ "product-1": [coffeeVariant] }}
        onLoadVariants={onLoadVariants}
        onAdd={onAdd}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(coffee, "variant-1", 1, undefined)
    );
    expect(
      screen.queryByRole("button", { name: "cashier.productMenu.add" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the product image and hides the SKU on menu cards", () => {
    render(
      <ProductMenu
        products={[coffee]}
        variantsByProductId={{ "product-1": [coffeeVariant] }}
        onLoadVariants={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "https://cdn.example.com/coffee.jpg");
    expect(screen.queryByText("COFFEE")).not.toBeInTheDocument();
    expect(screen.queryByText("cashier.productMenu.noSku")).not.toBeInTheDocument();
  });

  it("opens a variant modal only when a product has multiple variants", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onLoadVariants = vi.fn().mockResolvedValue([soupSmall, soupLarge]);

    render(
      <ProductMenu
        products={[soup]}
        variantsByProductId={{ "product-2": [soupSmall, soupLarge] }}
        onLoadVariants={onLoadVariants}
        onAdd={onAdd}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Deli Soup/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.firstElementChild).toHaveClass("max-h-[calc(100dvh-4rem)]", "overflow-y-auto");
    expect(screen.getByText("cashier.productMenu.chooseVariant")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /SOUP-L/ }));
    const decrease = screen.getByRole("button", {
      name: "cashier.orderPanel.decreaseQuantity",
    });
    expect(decrease).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.orderPanel.increaseQuantity" })
    );
    expect(decrease).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.productMenu.add" })
    );

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(soup, "variant-l", 2, undefined)
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the product grid a touch-scrolling pane for embedded WebViews", () => {
    render(
      <ProductMenu
        products={[coffee]}
        variantsByProductId={{ "product-1": [coffeeVariant] }}
        onLoadVariants={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Android WebView only sends a drag to the list itself when it is a
    // zero-basis pane with pan-y touch-action (see .pos-pane-scroll in index.css).
    const pane = screen.getByRole("button", { name: /Coffee/ }).parentElement
      ?.parentElement;
    expect(pane).toHaveClass("pos-pane-scroll", "overflow-y-auto");
  });

  it("marks ordered products as selected in the menu grid", () => {
    render(
      <ProductMenu
        products={[coffee, soup]}
        variantsByProductId={{
          "product-1": [coffeeVariant],
          "product-2": [soupSmall, soupLarge],
        }}
        orderedProductQuantities={{ "product-1": 2 }}
        onLoadVariants={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Coffee/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deli Soup/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("ignores a late variant response from a previously tapped product", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const pending = new Map<string, (variants: ProductVariant[]) => void>();
    const onLoadVariants = vi.fn(
      (productId: string) =>
        new Promise<ProductVariant[]>((resolve) => {
          pending.set(productId, resolve);
        })
    );

    render(
      <ProductMenu
        products={[coffee, soup]}
        variantsByProductId={{}}
        onLoadVariants={onLoadVariants}
        onAdd={onAdd}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Deli Soup/ }));

    await act(async () => {
      pending.get("product-2")?.([soupSmall, soupLarge]);
    });
    expect(
      screen.getByRole("heading", { name: "Deli Soup" })
    ).toBeInTheDocument();

    await act(async () => {
      pending.get("product-1")?.([coffeeVariant]);
    });

    expect(
      screen.getByRole("heading", { name: "Deli Soup" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SOUP-L/ })).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /SOUP-L/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "cashier.productMenu.add" })
    );
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(soup, "variant-l", 1, undefined)
    );
  });

  it("does not add an unavailable product from the menu", async () => {
    const onAdd = vi.fn();
    const soldOut = new Product({ ...coffee, isAvailable: false });

    render(
      <ProductMenu
        products={[soldOut]}
        variantsByProductId={{ "product-1": [coffeeVariant] }}
        onLoadVariants={vi.fn()}
        onAdd={onAdd}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getAllByText("cashier.productMenu.unavailable").length).toBeGreaterThan(
      0
    );
  });
  it("lets the cashier pick several options from one group", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const noodles = new Product({
      id: "product-3",
      tenantId: "t1",
      name: "Noodles",
      basePrice: "3000.0000",
      modifierGroups: [
        {
          id: "add-ons",
          name: "Add-ons",
          minSelection: 0,
          maxSelection: 2,
          isRequired: false,
          modifiers: [
            { id: "egg", name: "Egg", priceDelta: "500.0000", isDefault: false },
            { id: "cheese", name: "Cheese", priceDelta: "700.0000", isDefault: false },
            { id: "bacon", name: "Bacon", priceDelta: "900.0000", isDefault: false },
          ],
        },
      ],
    });
    const noodlesVariant = new ProductVariant({ id: "variant-n", productId: "product-3" });

    render(
      <ProductMenu
        products={[noodles]}
        variantsByProductId={{ "product-3": [noodlesVariant] }}
        onLoadVariants={vi.fn()}
        onAdd={onAdd}
        onClose={vi.fn()}
        offerOptions
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Noodles/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Egg/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Cheese/ }));
    expect(within(dialog).getByRole("checkbox", { name: /Bacon/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "cashier.productMenu.add" }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(noodles, "variant-n", 1, [
        { modifierId: "egg", name: "Egg", priceDelta: "500.0000" },
        { modifierId: "cheese", name: "Cheese", priceDelta: "700.0000" },
      ])
    );
  });

  it("sends the quick notes and typed note with the item's options", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const rice = new Product({
      id: "product-rice",
      tenantId: "t1",
      name: "Fried rice",
      basePrice: "8000.0000",
      modifierGroups: [
        {
          id: "spice",
          name: "Spice",
          minSelection: 0,
          maxSelection: 1,
          isRequired: false,
          modifiers: [{ id: "less", name: "Less spicy", priceDelta: "0", isDefault: false }],
        },
      ],
    });
    const riceVariant = new ProductVariant({ id: "variant-rice", productId: "product-rice" });

    render(
      <ProductMenu
        products={[rice]}
        variantsByProductId={{ "product-rice": [riceVariant] }}
        onLoadVariants={vi.fn()}
        onAdd={onAdd}
        onClose={vi.fn()}
        offerOptions
        quickNotes={["No onion", "Less salt"]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Fried rice/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("itemNote.placeholder"), {
      target: { value: "extra plate" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "No onion" }));
    expect(within(dialog).getByRole("button", { name: "No onion" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "cashier.productMenu.add" }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(rice, "variant-rice", 1, undefined, "extra plate, No onion")
    );
  });

  it("asks the product itself for options the menu list left out", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    // The menu list carries the product without its options, as the server may send it.
    const listed = new Product({
      id: "product-5",
      tenantId: "t1",
      name: "Noodles",
      basePrice: "3000.0000",
    });
    const detailed = new Product({
      ...listed,
      modifierGroups: [
        {
          id: "add-ons",
          name: "Add-ons",
          minSelection: 0,
          maxSelection: 2,
          isRequired: false,
          modifiers: [{ id: "egg", name: "Egg", priceDelta: "500.0000", isDefault: false }],
        },
      ],
    });
    const onLoadProduct = vi.fn().mockResolvedValue(detailed);
    const variant = new ProductVariant({ id: "variant-n5", productId: "product-5" });

    render(
      <ProductMenu
        products={[listed]}
        variantsByProductId={{ "product-5": [variant] }}
        onLoadVariants={vi.fn()}
        onAdd={onAdd}
        onClose={vi.fn()}
        offerOptions
        onLoadProduct={onLoadProduct}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Noodles/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Egg/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "cashier.productMenu.add" }));

    expect(onLoadProduct).toHaveBeenCalledWith("product-5");
    // The row is the menu's product; the options it offers came from the product itself.
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(listed, "variant-n5", 1, [
        { modifierId: "egg", name: "Egg", priceDelta: "500.0000" },
      ])
    );
  });

  it("does not ask for a product whose options the menu already carries", async () => {
    const onLoadProduct = vi.fn();
    const tea = new Product({
      id: "product-6",
      tenantId: "t1",
      name: "Tea",
      basePrice: "1000.0000",
      modifierGroups: [
        {
          id: "sugar",
          name: "Sugar",
          minSelection: 1,
          maxSelection: 1,
          isRequired: true,
          modifiers: [{ id: "less", name: "Less", priceDelta: "0", isDefault: true }],
        },
      ],
    });

    render(
      <ProductMenu
        products={[tea]}
        variantsByProductId={{ "product-6": [new ProductVariant({ id: "v6", productId: "product-6" })] }}
        onLoadVariants={vi.fn()}
        onAdd={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
        offerOptions
        onLoadProduct={onLoadProduct}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Tea/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(onLoadProduct).not.toHaveBeenCalled();
  });

  it("asks the product once when the menu's record shows no options, and remembers it", async () => {
    const onLoadProduct = vi.fn().mockResolvedValue(
      new Product({ id: "product-7", tenantId: "t1", name: "Water", basePrice: "500.0000", modifierGroups: [] })
    );
    const plain = new Product({
      id: "product-7",
      tenantId: "t1",
      name: "Water",
      basePrice: "500.0000",
      modifierGroups: [],
    });

    const view = render(
      <ProductMenu
        products={[plain]}
        variantsByProductId={{ "product-7": [new ProductVariant({ id: "v7", productId: "product-7" })] }}
        onLoadVariants={vi.fn()}
        onAdd={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
        offerOptions
        onLoadProduct={onLoadProduct}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Water/ }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(onLoadProduct).toHaveBeenCalledTimes(1);

    // Tapping it again uses what was already read.
    fireEvent.click(screen.getByRole("button", { name: /Water/ }));
    await waitFor(() => expect(onLoadProduct).toHaveBeenCalledTimes(1));
    view.unmount();
  });

  it("asks for a required group before adding", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const tea = new Product({
      id: "product-4",
      tenantId: "t1",
      name: "Tea",
      basePrice: "1000.0000",
      modifierGroups: [
        {
          id: "sugar",
          name: "Sugar",
          minSelection: 1,
          maxSelection: 1,
          isRequired: true,
          modifiers: [
            { id: "less", name: "Less", priceDelta: "0", isDefault: false },
            { id: "normal", name: "Normal", priceDelta: "0", isDefault: false },
          ],
        },
      ],
    });

    render(
      <ProductMenu
        products={[tea]}
        variantsByProductId={{
          "product-4": [new ProductVariant({ id: "variant-t", productId: "product-4" })],
        }}
        onLoadVariants={vi.fn()}
        onAdd={onAdd}
        onClose={vi.fn()}
        offerOptions
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Tea/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "cashier.productMenu.add" }));
    expect(within(dialog).getByText("cashier.productMenu.pickFrom")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("radio", { name: /Less/ }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Normal/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "cashier.productMenu.add" }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(tea, "variant-t", 1, [
        { modifierId: "normal", name: "Normal", priceDelta: "0" },
      ])
    );
  });
});
