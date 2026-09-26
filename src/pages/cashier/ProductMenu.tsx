import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Product, ProductVariant } from "@/core/domain/entities/Cashier";

interface ProductMenuProps {
  products: Product[];
  variantsByProductId: Record<string, ProductVariant[]>;
  orderedProductQuantities?: Record<string, number>;
  onLoadVariants: (productId: string) => Promise<ProductVariant[]>;
  onAdd: (
    product: Product,
    variantId: string,
    quantity: number
  ) => Promise<void>;
  onClose: () => void;
  groupByCategory?: boolean;
}

const variantLabel = (variant: ProductVariant): string =>
  variant.variantSku ||
  String(Object.values(variant.matrixOptions || {}).join(" / ")) ||
  variant.id.slice(0, 8);

const productCardImage = (
  product: Product,
  variantsByProductId: Record<string, ProductVariant[]>
): string | undefined =>
  product.imageUrl ||
  (variantsByProductId[product.id] || []).find((variant) => variant.imageUrl)
    ?.imageUrl;

function ProductCardImage({
  src,
  name,
}: {
  src?: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-24 items-center justify-center bg-slate-800 text-lg font-semibold uppercase text-slate-500">
        {name.trim().slice(0, 1) || "?"}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-24 w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function ProductMenu({
  products,
  variantsByProductId,
  orderedProductQuantities = {},
  onLoadVariants,
  onAdd,
  onClose,
  groupByCategory = false,
}: ProductMenuProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [variantOptions, setVariantOptions] = useState<ProductVariant[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [needsVariantChoice, setNeedsVariantChoice] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const categoryOf = useCallback(
    (product: Product) => product.categoryName || t("cashier.productMenu.otherCategory"),
    [t]
  );

  const categories = useMemo(
    () =>
      groupByCategory
        ? [...new Set(products.map(categoryOf))].sort((left, right) =>
            left.localeCompare(right)
          )
        : [],
    [categoryOf, groupByCategory, products]
  );

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return products.filter(
      (product) =>
        (!category || categoryOf(product) === category) &&
        (!keyword ||
          [product.name, product.baseSku]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword)))
    );
  }, [category, categoryOf, products, search]);

  const sections = groupByCategory
    ? categories
        .map((name) => ({
          name,
          items: visibleProducts.filter((product) => categoryOf(product) === name),
        }))
        .filter((section) => section.items.length)
    : [{ name: "", items: visibleProducts }];

  const variants = variantOptions.length
    ? variantOptions
    : selectedProduct
      ? variantsByProductId[selectedProduct.id] || []
      : [];

  const closeVariantModal = () => {
    setNeedsVariantChoice(false);
    setSelectedProduct(null);
    setSelectedVariantId("");
    setVariantOptions([]);
    setQuantity(1);
    setLocalError(null);
  };

  const loadVariants = async (product: Product): Promise<ProductVariant[]> => {
    const cached = variantsByProductId[product.id] || [];
    if (cached.length) return cached;
    return onLoadVariants(product.id);
  };

  const addProduct = async (
    product: Product,
    variantId: string,
    nextQuantity: number
  ) => {
    if (!variantId) return false;
    setIsAdding(true);
    setLocalError(null);
    try {
      await onAdd(product, variantId, nextQuantity);
      setQuantity(1);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setLocalError(
        /throttler|too many requests/i.test(message)
          ? t("cashier.errors.tooManyRequests")
          : message || t("cashier.errors.addProduct")
      );
      return false;
    } finally {
      setIsAdding(false);
    }
  };

  const selectProduct = async (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
    setLocalError(null);
    setNeedsVariantChoice(false);
    setVariantOptions([]);

    try {
      const loaded = await loadVariants(product);
      const defaultVariantId = loaded[0]?.id || "";
      setSelectedVariantId(defaultVariantId);
      setVariantOptions(loaded);

      if (loaded.length > 1) {
        setNeedsVariantChoice(true);
        return;
      }

      if (!defaultVariantId) {
        setLocalError(t("cashier.productMenu.noVariant"));
        return;
      }

      await addProduct(product, defaultVariantId, 1);
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.errors.loadVariants")
      );
    }
  };

  const addSelected = async () => {
    if (!selectedProduct || !selectedVariantId) return;
    const added = await addProduct(selectedProduct, selectedVariantId, quantity);
    if (added) closeVariantModal();
  };

  return (
    <section className="flex h-full min-h-0 flex-col text-white">
      <header className="flex items-center gap-2 border-b border-white/10 pb-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("cashier.productMenu.search")}
          className="min-h-10 flex-1 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-blue-500"
        />
        <Button variant="outline" onClick={onClose}>
          {t("cashier.productMenu.close")}
        </Button>
      </header>

      {groupByCategory && categories.length > 1 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {["", ...categories].map((name) => (
            <button
              key={name || "all"}
              type="button"
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                category === name ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {name || t("cashier.productMenu.allCategories")}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <section key={section.name || "all"}>
            {section.name ? (
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {section.name}
              </h3>
            ) : null}
            <div className="grid content-start grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {section.items.map((product) => {
                const orderedQty = Number(orderedProductQuantities[product.id] || 0);
                const isSelected =
                  selectedProduct?.id === product.id || orderedQty > 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => void selectProduct(product)}
                    className={[
                      "relative overflow-hidden rounded border bg-[#181818] text-left",
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-400 ring-offset-1 ring-offset-[#070707]"
                        : "border-slate-700",
                    ].join(" ")}
                  >
                    <ProductCardImage
                      src={productCardImage(product, variantsByProductId)}
                      name={product.name}
                    />
                    {orderedQty > 0 ? (
                      <span className="absolute right-2 top-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {orderedQty}
                      </span>
                    ) : null}
                    <span className="block px-3 py-2">
                      <span className="block truncate text-sm font-semibold">
                        {product.name}
                      </span>
                      <span className="mt-1 block font-semibold text-blue-400">
                        {product.basePrice}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {visibleProducts.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            {t("cashier.productMenu.notFound")}
          </p>
        ) : null}
      </div>
      {localError && !needsVariantChoice ? (
        <p className="mt-2 text-xs text-red-300">{localError}</p>
      ) : null}

      {needsVariantChoice && selectedProduct ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-variant-title"
          onClick={closeVariantModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#181818] p-5 text-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {t("cashier.productMenu.chooseVariant")}
                </p>
                <h2
                  id="product-variant-title"
                  className="mt-1 text-lg font-semibold"
                >
                  {selectedProduct.name}
                </h2>
              </div>
              <Button variant="outline" size="sm" onClick={closeVariantModal}>
                {t("common.cancel")}
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {variants.map((variant) => {
                const selected = selectedVariantId === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={[
                      "rounded border px-3 py-3 text-left text-sm",
                      selected
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-700 bg-slate-900",
                    ].join(" ")}
                  >
                    {variantLabel(variant)}
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block text-xs text-slate-300">
              {t("cashier.productMenu.quantity")}
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number(event.target.value) || 1))
                }
                className="mt-1 min-h-10 w-full rounded border border-slate-600 bg-slate-800 px-2 text-sm"
              />
            </label>

            {localError ? (
              <p className="mt-3 text-xs text-red-300">{localError}</p>
            ) : null}

            <Button
              className="mt-4"
              fullWidth
              disabled={!selectedVariantId}
              isLoading={isAdding}
              onClick={() => void addSelected()}
            >
              {t("cashier.productMenu.add")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
