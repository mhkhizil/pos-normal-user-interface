import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { ManagerApprovalFields } from "@/components/shift/ManagerApprovalFields";
import { shiftApi } from "@/components/shift/shiftApi";
import type {
  EditSalesOrderDTO,
  EditSalesOrderPreviewDTO,
  EditSalesOrderPreviewResultDTO,
  EditSalesOrderResultDTO,
} from "@/core/application/dtos/SalesOrderDTO";
import type { Customer } from "@/core/domain/entities/Customer";
import type { Product, ProductVariant, SalesOrder } from "@/core/domain/entities/Cashier";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { useCustomerManagement } from "@/core/presentation/hooks/useCustomerManagement";
import { useGuestWalletManagement } from "@/core/presentation/hooks/useGuestWalletManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { useNumberFormatter } from "@/lib/i18n/formatters";
import { EMPTY_MANAGER_LOGIN, ManagerLogin, managerLoginFilled } from "@/lib/pos/managerLogin";
import {
  canRelabel,
  editPayload,
  hasEditChanges,
  initialEditState,
  isGuestCardMethod,
  OrderEditState,
  relabelChoices,
} from "@/lib/pos/orderEdit";
import { variantOptionsName, withVariant } from "@/lib/pos/orderListDisplay";
import { CardTapDialog } from "../spa/CardTapDialog";
import { HostessPicker } from "../spa/HostessPicker";

const APPROVAL = "sales:order-edit:approve";

const field =
  "rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-[#1a9bff]";

export function EditOrderDialog({
  order,
  onClose,
  onSaved,
  previewEdit,
  saveEdit,
}: {
  order: SalesOrder;
  onClose: () => void;
  onSaved: (result: EditSalesOrderResultDTO) => void;
  previewEdit: (
    id: string,
    payload: EditSalesOrderPreviewDTO
  ) => Promise<EditSalesOrderPreviewResultDTO>;
  saveEdit: (
    id: string,
    payload: EditSalesOrderDTO,
    approverToken: string
  ) => Promise<EditSalesOrderResultDTO>;
}) {
  const { t } = useTranslation();
  const { formatCurrency } = useNumberFormatter();
  const money = (value: unknown) => formatCurrency(Number(value) || 0);
  const {
    products,
    fetchProducts,
    fetchProductVariants,
    paymentMethods,
    fetchPaymentMethods,
    discountReasons,
    fetchDiscountReasons,
    selectOrder,
    selectedOrderLines,
    selectedOrderPayments,
  } = useCashier();
  const { getCustomers } = useCustomerManagement();
  const { lookupCard } = useGuestWalletManagement();
  const { requireCashierContext } = usePosWorkspace();

  const [initial, setInitial] = useState<OrderEditState | null>(null);
  const [state, setState] = useState<OrderEditState | null>(null);
  const [preview, setPreview] = useState<EditSalesOrderPreviewResultDTO | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [variantChoice, setVariantChoice] = useState<{
    product: Product;
    variants: ProductVariant[];
  } | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [hostessFor, setHostessFor] = useState<string | null>(null);
  const [settlementMethodId, setSettlementMethodId] = useState("");
  const [reason, setReason] = useState("");
  const [manager, setManager] = useState<ManagerLogin>(EMPTY_MANAGER_LOGIN);
  const [cardPrompt, setCardPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    void selectOrder(order).catch(() => setError(t("salesOrders.edit.errors.load")));
    void fetchPaymentMethods();
    void fetchDiscountReasons();
    void fetchProducts({ page: 1, limit: 200, isAvailable: true });
  }, [fetchDiscountReasons, fetchPaymentMethods, fetchProducts, order, selectOrder, t]);

  useEffect(() => {
    if (loaded.current || !selectedOrderLines.length) return;
    loaded.current = true;
    const start = initialEditState(order, selectedOrderLines, t("salesOrders.item"));
    setInitial(start);
    setState(start);
  }, [order, selectedOrderLines, t]);

  const payload = useMemo(
    () => (state && initial ? editPayload(state, initial) : null),
    [initial, state]
  );
  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewEdit(order.id, payload)
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((caught) => {
          if (!cancelled) setPreviewError(caught instanceof Error ? caught.message : String(caught));
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // payloadKey stands for payload: re-price only when what is sent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, payloadKey, previewEdit]);

  const methodById = useMemo(
    () => new Map(paymentMethods.map((method) => [method.id, method])),
    [paymentMethods]
  );
  const takenPayments = selectedOrderPayments.filter((payment) => Number(payment.amount) > 0);
  const paidByCard = selectedOrderPayments.some((payment) => payment.walletLedgerEntryId);
  const difference = Number(preview?.difference || 0);
  const settlementChoices = paymentMethods.filter(
    (method) =>
      method.isActive !== false &&
      (!isGuestCardMethod(method) || difference > 0 || paidByCard)
  );
  const settlementMethod = methodById.get(settlementMethodId);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((product) => product.kind !== "RENTAL" && product.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [products, search]);

  if (!state || !initial) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
        <div className="w-full max-w-sm space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-5 text-white">
          <p className="text-sm text-slate-300">{error || t("common.loading")}</p>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  const update = (change: Partial<OrderEditState>) =>
    setState((current) => (current ? { ...current, ...change } : current));
  const updateLine = (key: string, change: Partial<OrderEditState["lines"][number]>) =>
    setState((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) => (line.key === key ? { ...line, ...change } : line)),
          }
        : current
    );

  const variantPrice = (product: Product, variant: ProductVariant) =>
    Number(product.basePrice || 0) + Number(variant.priceModifier || 0);

  const addProduct = async (product: Product) => {
    setSearch("");
    const variants = await fetchProductVariants(product.id);
    if (variants.length > 1) {
      setVariantChoice({ product, variants });
      return;
    }
    if (variants[0]) addVariant(product, variants[0]);
  };

  const addVariant = (product: Product, variant: ProductVariant) => {
    setVariantChoice(null);
    const price = variantPrice(product, variant);
    setState((current) =>
      current
        ? {
            ...current,
            lines: [
              ...current.lines,
              {
                key: `new-${Date.now()}-${variant.id}`,
                variantId: variant.id,
                name: withVariant(product.name, variantOptionsName(variant)),
                quantity: 1,
                unitPrice: String(price),
                removed: false,
              },
            ],
          }
        : current
    );
  };

  const findCustomers = async () => {
    const result = await getCustomers({ page: 1, limit: 5, search: customerSearch.trim() });
    setCustomerResults(result.customers);
  };

  const changed = hasEditChanges(state, initial);

  const submit = async (guestCardId?: string) => {
    setError(null);
    if (!changed) return setError(t("salesOrders.edit.errors.noChanges"));
    if (!reason.trim()) return setError(t("salesOrders.edit.errors.reason"));
    if (!managerLoginFilled(manager)) return setError(t("salesOrders.edit.errors.manager"));
    if (!preview || previewError) return setError(previewError || t("salesOrders.edit.errors.preview"));
    if (difference !== 0 && !settlementMethod) {
      return setError(t("salesOrders.edit.errors.settlement"));
    }
    if (difference > 0 && isGuestCardMethod(settlementMethod) && !guestCardId) {
      setCardPrompt(true);
      return;
    }
    setSaving(true);
    try {
      const context = await requireCashierContext();
      const { token } = await shiftApi().approve(manager.userId.trim(), manager.password, APPROVAL);
      const result = await saveEdit(
        order.id,
        {
          ...payload!,
          reason: reason.trim(),
          posSessionId: context.posSessionId,
          ...(difference !== 0 && settlementMethod
            ? {
                settlement: {
                  paymentMethodId: settlementMethod.id,
                  ...(guestCardId ? { guestCardId } : {}),
                },
              }
            : {}),
        },
        token
      );
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
      setCardPrompt(false);
    }
  };

  const readCard = async (uid: string) => {
    try {
      const card = await lookupCard(uid);
      await submit(card.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setCardPrompt(false);
    }
  };

  const section = "space-y-2 border-t border-slate-800 pt-3";
  const heading = "text-xs font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl space-y-4 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">
            {t("salesOrders.edit.title", { number: order.orderNumber || order.id })}
          </h2>
          <span className="text-sm text-slate-300">
            {t("salesOrders.edit.paid", { amount: money(order.grandTotal) })}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={heading}>{t("salesOrders.edit.items")}</p>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("salesOrders.edit.addItem")}
              aria-label={t("salesOrders.edit.addItem")}
              className={`${field} w-56`}
            />
          </div>
          {matches.length ? (
            <div className="flex flex-wrap gap-2">
              {matches.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => void addProduct(product)}
                  className="rounded border border-slate-600 px-2 py-1 text-sm hover:border-[#1a9bff]"
                >
                  + {product.name} · {money(product.basePrice)}
                </button>
              ))}
            </div>
          ) : null}
          {variantChoice ? (
            <div className="space-y-1">
              <p className="text-xs text-slate-400">
                {variantChoice.product.name} · {t("cashier.productMenu.chooseVariant")}
              </p>
              <div className="flex flex-wrap gap-2">
                {variantChoice.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => addVariant(variantChoice.product, variant)}
                    className="rounded border border-slate-600 px-2 py-1 text-sm hover:border-[#1a9bff]"
                  >
                    + {variantOptionsName(variant) || variant.variantSku} ·{" "}
                    {money(variantPrice(variantChoice.product, variant))}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setVariantChoice(null)}
                  className="rounded px-2 py-1 text-sm text-slate-400 hover:text-slate-200"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : null}
          <ul className="divide-y divide-slate-800">
            {state.lines.map((line) => (
              <li key={line.key} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span
                  className={`min-w-40 flex-1 ${line.removed ? "text-slate-500 line-through" : ""}`}
                >
                  {line.name}
                  {line.hostessId ? (
                    <button
                      type="button"
                      disabled={line.removed}
                      onClick={() => setHostessFor(line.key)}
                      className="ml-2 text-xs text-[#1a9bff]"
                    >
                      {line.hostessName || t("salesOrders.edit.changeHostess")}
                    </button>
                  ) : null}
                </span>
                {line.removed ? (
                  <>
                    <span className="text-xs text-slate-500">{t("salesOrders.edit.removed")}</span>
                    <button
                      type="button"
                      onClick={() => updateLine(line.key, { removed: false })}
                      className="text-xs text-[#1a9bff]"
                    >
                      {t("salesOrders.edit.undo")}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center rounded bg-slate-800">
                      <button
                        type="button"
                        aria-label={t("salesOrders.edit.fewer", { name: line.name })}
                        disabled={line.quantity <= 1}
                        onClick={() => updateLine(line.key, { quantity: line.quantity - 1 })}
                        className="h-8 w-8 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold">{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={t("salesOrders.edit.more", { name: line.name })}
                        onClick={() => updateLine(line.key, { quantity: line.quantity + 1 })}
                        className="h-8 w-8"
                      >
                        +
                      </button>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-slate-400">
                      @
                      <input
                        type="number"
                        min={0}
                        value={line.unitPrice}
                        aria-label={t("salesOrders.edit.price", { name: line.name })}
                        onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                        className={`${field} w-24`}
                      />
                    </label>
                    <span className="w-24 text-right">
                      {money(line.quantity * (Number(line.unitPrice) || 0))}
                    </span>
                    <button
                      type="button"
                      aria-label={t("salesOrders.edit.remove", { name: line.name })}
                      onClick={() =>
                        line.id
                          ? updateLine(line.key, { removed: true })
                          : update({ lines: state.lines.filter((item) => item.key !== line.key) })
                      }
                      className="h-8 w-8 rounded text-red-400 hover:bg-red-950/50"
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={section}>
          <p className={heading}>{t("salesOrders.edit.bill")}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              {t("salesOrders.discount")}
              <input
                type="number"
                min={0}
                value={state.billDiscount}
                onChange={(event) => update({ billDiscount: event.target.value })}
                className={`${field} w-28`}
              />
            </label>
            {discountReasons.length ? (
              <select
                value={state.discountReasonId}
                aria-label={t("salesOrders.edit.discountReason")}
                onChange={(event) => update({ discountReasonId: event.target.value })}
                className={field}
              >
                <option value="">{t("salesOrders.edit.discountReason")}</option>
                {discountReasons.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={state.includeTax}
                onChange={(event) => update({ includeTax: event.target.checked })}
              />
              {t("salesOrders.tax")}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={state.includeServiceCharge}
                onChange={(event) => update({ includeServiceCharge: event.target.checked })}
              />
              {t("salesOrders.serviceCharge")}
            </label>
          </div>
        </div>

        <div className={section}>
          <p className={heading}>{t("salesOrders.edit.customer")}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{state.customerName || t("salesOrders.walkIn")}</span>
            {state.customerId ? (
              <button
                type="button"
                onClick={() => update({ customerId: null, customerName: "" })}
                className="text-xs text-[#1a9bff]"
              >
                {t("salesOrders.edit.makeWalkIn")}
              </button>
            ) : null}
            <input
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder={t("salesOrders.edit.findCustomer")}
              aria-label={t("salesOrders.edit.findCustomer")}
              className={`${field} w-48`}
            />
            <Button
              variant="secondary"
              disabled={!customerSearch.trim()}
              onClick={() => void findCustomers()}
            >
              {t("salesOrders.edit.find")}
            </Button>
          </div>
          {customerResults.length ? (
            <div className="flex flex-wrap gap-2">
              {customerResults.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    update({ customerId: customer.id, customerName: customer.name });
                    setCustomerResults([]);
                    setCustomerSearch("");
                  }}
                  className="rounded border border-slate-600 px-2 py-1 text-sm hover:border-[#1a9bff]"
                >
                  {customer.name}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {takenPayments.length ? (
          <div className={section}>
            <p className={heading}>{t("salesOrders.edit.payments")}</p>
            {takenPayments.map((payment) => {
              const method = methodById.get(payment.paymentMethodId);
              return (
                <div key={payment.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="min-w-28">{method?.name || payment.paymentMethodId}</span>
                  <span className="w-28">{money(payment.amount)}</span>
                  {canRelabel(payment, method) ? (
                    <select
                      aria-label={t("salesOrders.edit.methodFor", { amount: money(payment.amount) })}
                      value={state.paymentMethods[payment.id] || payment.paymentMethodId}
                      onChange={(event) => {
                        const next = { ...state.paymentMethods };
                        if (event.target.value === payment.paymentMethodId) delete next[payment.id];
                        else next[payment.id] = event.target.value;
                        update({ paymentMethods: next });
                      }}
                      className={field}
                    >
                      {relabelChoices(paymentMethods).map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={`${section} space-y-3`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-300">
              {t("salesOrders.edit.wasNow", {
                was: money(order.grandTotal),
                now: preview ? money(preview.newTotal) : "…",
              })}
            </p>
            {preview ? (
              <p
                className={`text-base font-bold ${
                  difference > 0 ? "text-amber-300" : difference < 0 ? "text-emerald-300" : ""
                }`}
              >
                {difference > 0
                  ? t("salesOrders.edit.collect", { amount: money(difference) })
                  : difference < 0
                    ? t("salesOrders.edit.refund", { amount: money(-difference) })
                    : t("salesOrders.edit.noDifference")}
              </p>
            ) : null}
          </div>
          {previewError ? <p className="text-sm text-red-400">{previewError}</p> : null}
          {preview && difference !== 0 ? (
            <div className="space-y-1">
              <p className="text-sm text-slate-300">
                {difference > 0 ? t("salesOrders.edit.collectBy") : t("salesOrders.edit.refundTo")}
              </p>
              <div className="flex flex-wrap gap-2">
                {settlementChoices.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    aria-pressed={settlementMethodId === method.id}
                    onClick={() => setSettlementMethodId(method.id)}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      settlementMethodId === method.id
                        ? "border-[#1a9bff] bg-[#1a9bff]/20"
                        : "border-slate-700"
                    }`}
                  >
                    {method.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="block text-sm">
            {t("salesOrders.edit.reason")}
            <input
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("salesOrders.edit.reasonPlaceholder")}
              className={`${field} mt-1 w-full`}
            />
          </label>
          <div className="space-y-1">
            <p className="text-sm">{t("salesOrders.edit.managerApproval")}</p>
            <ManagerApprovalFields value={manager} onChange={setManager} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button isLoading={saving} disabled={!changed} onClick={() => void submit()}>
              {t("salesOrders.edit.save")}
            </Button>
          </div>
        </div>
      </div>

      {hostessFor ? (
        <HostessPicker
          serviceName={state.lines.find((line) => line.key === hostessFor)?.name || ""}
          onCancel={() => setHostessFor(null)}
          onPick={(hostess) => {
            updateLine(hostessFor, { hostessId: hostess.id, hostessName: hostess.name });
            setHostessFor(null);
          }}
        />
      ) : null}

      {cardPrompt ? (
        <CardTapDialog
          kind="ktv"
          title={t("salesOrders.edit.collect", { amount: money(difference) })}
          isBusy={saving}
          error={error}
          onCardRead={(uid) => void readCard(uid)}
          onCancel={() => setCardPrompt(false)}
        />
      ) : null}
    </div>
  );
}
