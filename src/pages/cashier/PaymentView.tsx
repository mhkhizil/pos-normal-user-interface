import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { CardCaptureStatus } from "@/components/ui/CardCaptureStatus";
import { SplitPaymentTenderDTO } from "@/core/application/dtos/CashierDTO";
import { PaymentMethod } from "@/core/domain/entities/Cashier";
import { isMemberCardPaymentMethod } from "@/lib/pos/paymentMethods";
import { remainingReceivable } from "@/lib/pos/splitPayments";
import { formatPosMoney } from "@/lib/pos/orderListDisplay";
import type { BillBreakdown } from "@/lib/pos/billBreakdown";
import { BillBreakdownRows } from "./BillBreakdownRows";

interface MemberCardLookupProps {
  cardUid: string;
  guestName?: string;
  walletNumber?: string;
  balance?: string;
  status?: string;
  error?: string | null;
  isLoading?: boolean;
  nfcSupported: boolean;
  nfcActive: boolean;
  nfcError: string | null;
  lastUid?: string;
  onEnableNfc: () => void;
  onCardUidChange: (value: string) => void;
  onDetect: () => void;
}

interface PaymentViewProps {
  methods: PaymentMethod[];
  selectedMethodId: string;
  paymentAmount: string;
  total: string;
  breakdown?: BillBreakdown;
  billOptions?: {
    includeTax: boolean;
    includeServiceCharge: boolean;
    isLoading: boolean;
    disabled?: boolean;
    error?: string;
    onChange: (field: "includeTax" | "includeServiceCharge", value: boolean) => void;
  };
  isSplitMode: boolean;
  splitTenders: SplitPaymentTenderDTO[];
  isLoading?: boolean;
  memberCardLookup?: MemberCardLookupProps;
  /** A credit tender is picked: whose account it goes on. */
  creditAccount?: {
    customerName?: string;
    owes?: number;
    available?: number;
    onChange: () => void;
  };
  onSelectMethod: (methodId: string) => void;
  onPaymentAmountChange: (value: string) => void;
  onOpenSplit: () => void;
  onClosePay: () => void;
  onAddTender: () => void;
  onRemoveTender: (tenderId: string) => void;
}

function CashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="#1a9bff" />
      <circle cx="12" cy="12" r="2.5" fill="#fff" />
      <path d="M7 10h1.5M15.5 14H17" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

function MemberCardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="#111827" />
      <rect x="2" y="8" width="20" height="3" fill="#374151" />
      <rect x="5" y="14" width="7" height="2" rx="0.5" fill="#e5e7eb" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" fill="#f59e0b" />
      <path d="M14 12h7v5H14a2.5 2.5 0 0 1 0-5Z" fill="#fb923c" />
      <circle cx="16.5" cy="14.5" r="1" fill="#fff" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M12 3v18M8 8H5a2 2 0 0 0-2 2v8M16 8h3a2 2 0 0 1 2 2v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <circle cx="16" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

function CloseSplitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Amounts on the pay screen read the same way as the cart's: two decimals. */
const formatMoney = (value: number): string => formatPosMoney(value);

/** Overlay the card lookup on phones and any portrait POS, not just <768px. */
const CARD_LOOKUP_SHEET_MQ = "(max-width: 1023px), (orientation: portrait)";

function methodLabel(method: PaymentMethod, memberCardLabel: string): string {
  if (isMemberCardPaymentMethod(method)) return memberCardLabel;
  return method.name.toUpperCase();
}

function methodRank(method: PaymentMethod): number {
  const kind = String(method.kind || method.code || "").toUpperCase();
  if (kind === "CASH" || /cash/i.test(method.name)) return 0;
  if (isMemberCardPaymentMethod(method)) return 1;
  return 2;
}

export function PaymentView({
  methods,
  selectedMethodId,
  paymentAmount,
  total,
  breakdown,
  billOptions,
  isSplitMode,
  splitTenders,
  isLoading,
  memberCardLookup,
  creditAccount,
  onSelectMethod,
  onPaymentAmountChange,
  onOpenSplit,
  onClosePay,
  onAddTender,
  onRemoveTender,
}: PaymentViewProps) {
  const { t } = useTranslation();
  const [confirmClose, setConfirmClose] = useState(false);
  const [cardLookupOpen, setCardLookupOpen] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const remaining = remainingReceivable(total, isSplitMode ? splitTenders : []);
  const displayRemaining = isSplitMode ? remaining : Number(total || 0);
  const splitCovered =
    isSplitMode && splitTenders.length > 0 && remaining <= 0.009;
  const billTotal = Number(total || 0);
  const memberCardLabel = t("cashier.payment.memberCard");
  const selectedMethod = methods.find((method) => method.id === selectedMethodId);
  const showMemberCardLookup =
    Boolean(memberCardLookup) &&
    Boolean(selectedMethod && isMemberCardPaymentMethod(selectedMethod));
  const sortedMethods = useMemo(
    () => [...methods].sort((a, b) => methodRank(a) - methodRank(b)),
    [methods]
  );
  const requestClosePay = useCallback(() => {
    if (isSplitMode && splitTenders.length) {
      setConfirmClose(true);
      return;
    }
    onClosePay();
  }, [isSplitMode, onClosePay, splitTenders.length]);

  useEffect(() => {
    if (!isSplitMode) setConfirmClose(false);
  }, [isSplitMode]);

  useEffect(() => {
    if (showMemberCardLookup) setCardLookupOpen(true);
  }, [showMemberCardLookup]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (confirmClose) {
        setConfirmClose(false);
        return;
      }
      if (optionsOpen) {
        setOptionsOpen(false);
        return;
      }
      if (
        showMemberCardLookup &&
        cardLookupOpen &&
        window.matchMedia(CARD_LOOKUP_SHEET_MQ).matches
      ) {
        setCardLookupOpen(false);
        return;
      }
      requestClosePay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardLookupOpen, confirmClose, optionsOpen, requestClosePay, showMemberCardLookup]);

  // Below 1100px the bill, the split rail and the methods stack in one column and
  // that whole column scrolls: a fixed grid row (with a 38% bill box) squeezed the
  // payment methods into blank slivers and cut the bill in half on a phone held
  // sideways (900x405). The desktop panes keep their own scrolling at >=1100px.
  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#202020] text-white min-[1100px]:grid min-[1100px]:grid-cols-[minmax(11rem,16rem)_4.5rem_minmax(0,1fr)] min-[1100px]:grid-rows-none min-[1100px]:overflow-hidden">
      <aside className="order-3 flex shrink-0 flex-col border-t border-white/10 p-2 min-[1100px]:order-none min-[1100px]:min-h-0 min-[1100px]:shrink min-[1100px]:overflow-y-auto min-[1100px]:border-r min-[1100px]:border-t-0">
        <div className="rounded bg-white p-3 text-slate-900">
          <p className="text-sm font-semibold">{t("cashier.payment.bill")}</p>
          {breakdown ? (
            <div className="mt-3">
              <BillBreakdownRows breakdown={breakdown} />
            </div>
          ) : null}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
            <span>{t("cashier.total")}</span>
            <span>{formatMoney(billTotal)}</span>
          </div>
        </div>

        {isSplitMode ? (
          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto rounded border border-blue-500/40 bg-black/25 p-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                {t("cashier.payment.splitOn")}
              </p>
              {splitTenders.length ? (
                <p className="text-[10px] text-slate-400">
                  {t("cashier.payment.splitTenderCount", {
                    count: splitTenders.length,
                  })}
                </p>
              ) : null}
            </div>
            {confirmClose ? (
              <div className="space-y-2 rounded border border-amber-400/40 bg-amber-950/50 p-2">
                <p className="text-xs text-amber-100">
                  {t("cashier.payment.closeSplitConfirm", {
                    count: splitTenders.length,
                  })}
                </p>
                <Button
                  size="sm"
                  fullWidth
                  variant="secondary"
                  onClick={() => setConfirmClose(false)}
                >
                  {t("cashier.payment.keepSplit")}
                </Button>
                <Button size="sm" fullWidth onClick={onClosePay}>
                  {t("cashier.payment.confirmCloseSplit")}
                </Button>
              </div>
            ) : (
              <>
                <input
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(event) => onPaymentAmountChange(event.target.value)}
                  aria-label={t("cashier.payment.splitAmount")}
                  className="min-h-9 w-full rounded border border-slate-600 bg-slate-800 px-2 text-sm"
                />
                <Button
                  size="sm"
                  fullWidth
                  disabled={
                    !selectedMethodId ||
                    Number(paymentAmount) <= 0 ||
                    isLoading ||
                    remaining <= 0.009
                  }
                  onClick={onAddTender}
                >
                  {t("cashier.payment.addTender")}
                </Button>
              </>
            )}
            {splitTenders.map((tender) => {
              const method = methods.find((item) => item.id === tender.paymentMethodId);
              return (
                <div
                  key={tender.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded bg-white/5 px-2 py-1.5 text-xs"
                >
                  <span className="truncate">
                    {method ? methodLabel(method, memberCardLabel) : tender.paymentMethodId}
                    {tender.guestCardId ? ` · ${tender.guestCardId}` : ""}
                  </span>
                  <span className="tabular-nums text-slate-200">
                    {formatMoney(Number(tender.amount))}
                  </span>
                  <button
                    type="button"
                    className="text-red-300 hover:text-red-200"
                    onClick={() => onRemoveTender(tender.id)}
                  >
                    {t("cashier.orderPanel.remove")}
                  </button>
                </div>
              );
            })}
            {!splitTenders.length && !confirmClose ? (
              <p className="text-xs text-slate-400">{t("cashier.payment.splitHint")}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">{t("cashier.payment.splitRailHint")}</p>
        )}
        {billOptions ? (
          <div className="mt-3 shrink-0">
            <button
              type="button"
              aria-expanded={optionsOpen}
              aria-controls="payment-bill-options"
              className="flex min-h-11 w-full items-center justify-between rounded border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              {t("cashier.payment.options")}
              <span aria-hidden="true">{optionsOpen ? "−" : "+"}</span>
            </button>
            {optionsOpen ? (
              <fieldset id="payment-bill-options" className="mt-2 rounded border border-slate-600 bg-slate-900 p-2" disabled={billOptions.disabled ?? isLoading}>
                <legend className="sr-only">{t("cashier.payment.options")}</legend>
                {(["includeTax", "includeServiceCharge"] as const).map((field) => (
                  <label key={field} className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm">
                    <input
                      type="checkbox"
                      checked={billOptions[field]}
                      onChange={(event) => billOptions.onChange(field, event.target.checked)}
                      className="h-5 w-5 accent-blue-500"
                    />
                    {t(`cashier.payment.${field}`)}
                  </label>
                ))}
                <p className="px-1 pb-1 text-xs text-slate-400">{t("cashier.payment.optionsHint")}</p>
              </fieldset>
            ) : null}
            {billOptions.isLoading ? <p role="status" className="mt-2 text-xs text-blue-200">{t("cashier.payment.updatingBill")}</p> : null}
            {billOptions.error ? <p role="alert" className="mt-2 text-xs text-red-300">{t("cashier.payment.billOptionsError")}</p> : null}
          </div>
        ) : null}
      </aside>

      <div className="order-2 flex shrink-0 flex-row items-stretch gap-1 overflow-x-auto border-t border-white/10 bg-[#171717] p-1 min-[1100px]:order-none min-[1100px]:min-h-0 min-[1100px]:flex-col min-[1100px]:overflow-y-auto min-[1100px]:border-r min-[1100px]:border-t-0">
        <button
          type="button"
          onClick={() => {
            if (!isSplitMode) onOpenSplit();
          }}
          aria-pressed={isSplitMode}
          aria-label={t("cashier.payment.split")}
          disabled={isLoading}
          className={[
            "flex min-h-12 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded px-2 py-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 min-[1100px]:min-h-20 min-[1100px]:w-full min-[1100px]:flex-none min-[1100px]:flex-col min-[1100px]:gap-0",
            isSplitMode
              ? "cursor-default bg-blue-700 text-white ring-2 ring-blue-300"
              : "bg-blue-600 text-white hover:bg-blue-500",
          ].join(" ")}
        >
          <SplitIcon />
          <span className="min-[1100px]:mt-1">{t("cashier.payment.split")}</span>
        </button>
        <button
          type="button"
          onClick={requestClosePay}
          aria-label={t("cashier.payment.closePayTitle")}
          className="flex min-h-12 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded bg-slate-800 px-2 py-2 text-[11px] font-semibold text-white hover:bg-slate-600 min-[1100px]:min-h-16 min-[1100px]:w-full min-[1100px]:flex-none min-[1100px]:flex-col min-[1100px]:gap-0"
        >
          <CloseSplitIcon />
          <span className="min-[1100px]:mt-1">{t("cashier.payment.closePay")}</span>
        </button>
      </div>

      <div className="order-1 flex min-w-0 shrink-0 flex-col p-2 min-[1100px]:order-none min-[1100px]:min-h-0 min-[1100px]:overflow-y-auto">
        <div
          className={[
            "flex min-h-12 items-center rounded px-3 text-sm font-semibold",
            splitCovered ? "bg-emerald-600" : "bg-blue-600",
          ].join(" ")}
        >
          {splitCovered
            ? t("cashier.payment.splitCovered")
            : t("cashier.payment.remaining", {
                amount: formatMoney(displayRemaining),
              })}
        </div>
        {showMemberCardLookup && memberCardLookup && cardLookupOpen ? (
          <div
            className="fixed inset-0 z-40 bg-black/70 lg:landscape:hidden"
            onClick={() => setCardLookupOpen(false)}
            aria-hidden="true"
          />
        ) : null}
        {showMemberCardLookup && memberCardLookup ? (
          <div
            role="dialog"
            aria-label={t("cashier.payment.tapMemberCard")}
            className={[
              "rounded border border-blue-400/40 bg-[#111111] text-sm",
              cardLookupOpen
                ? [
                    "fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-1.5rem),32rem)] -translate-x-1/2 -translate-y-1/2",
                    "max-h-[min(90dvh,44rem)] overflow-y-auto overscroll-contain rounded-2xl p-4",
                    "pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
                    "lg:landscape:static lg:landscape:left-auto lg:landscape:top-auto lg:landscape:z-auto",
                    "lg:landscape:mt-2 lg:landscape:w-auto lg:landscape:max-w-none lg:landscape:max-h-none",
                    "lg:landscape:translate-x-0 lg:landscape:translate-y-0 lg:landscape:overflow-visible",
                    "lg:landscape:rounded lg:landscape:p-3 lg:landscape:pt-3 lg:landscape:pb-3",
                  ].join(" ")
                : "hidden lg:landscape:mt-2 lg:landscape:block",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm text-slate-300 lg:landscape:text-xs lg:landscape:text-slate-400">
                {t("cashier.payment.tapMemberCard")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11 shrink-0 px-3 lg:landscape:hidden"
                onClick={() => setCardLookupOpen(false)}
              >
                {t("cashier.payment.closeCardLookup")}
              </Button>
            </div>
            <input
              value={memberCardLookup.cardUid}
              onChange={(event) =>
                memberCardLookup.onCardUidChange(event.target.value)
              }
              placeholder={t("crm.cardUid")}
              className="mt-3 min-h-12 w-full min-w-0 rounded border border-slate-600 bg-slate-900 px-3 text-base text-white outline-none focus:border-blue-400 lg:landscape:mt-2 lg:landscape:min-h-11 lg:landscape:text-sm"
            />
            <div className="mt-3 lg:landscape:mt-2">
              <CardCaptureStatus
                nfcSupported={memberCardLookup.nfcSupported}
                nfcActive={memberCardLookup.nfcActive}
                nfcError={memberCardLookup.nfcError}
                lastUid={memberCardLookup.lastUid}
                onEnableNfc={memberCardLookup.onEnableNfc}
              />
            </div>
            <Button
              type="button"
              className="mt-3 min-h-12 w-full lg:landscape:mt-2 lg:landscape:min-h-10 lg:landscape:w-auto"
              onClick={memberCardLookup.onDetect}
              disabled={
                memberCardLookup.isLoading || !memberCardLookup.cardUid.trim()
              }
            >
              {memberCardLookup.isLoading
                ? t("cashier.payment.lookingUpMemberCard")
                : t("cashier.payment.lookupMemberCard")}
            </Button>
            {memberCardLookup.guestName || memberCardLookup.walletNumber ? (
              <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100">
                <p className="text-xs uppercase tracking-wide">
                  {t("cashier.payment.memberWallet")}
                </p>
                <p className="mt-1 break-words text-base font-semibold">
                  {memberCardLookup.guestName || memberCardLookup.walletNumber}
                </p>
                {memberCardLookup.walletNumber ? (
                  <p className="break-all text-xs text-emerald-200">
                    {memberCardLookup.walletNumber}
                  </p>
                ) : null}
                {memberCardLookup.balance ? (
                  <p className="mt-1 text-lg tabular-nums">
                    {formatMoney(Number(memberCardLookup.balance))}
                  </p>
                ) : null}
                {memberCardLookup.status ? (
                  <p className="text-xs uppercase text-emerald-200">
                    {memberCardLookup.status}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-emerald-200/80">
                  {t("cashier.payment.memberBalanceHint")}
                </p>
              </div>
            ) : null}
            {memberCardLookup.error ? (
              <p className="mt-2 text-sm text-red-300">{memberCardLookup.error}</p>
            ) : null}
          </div>
        ) : null}
        {showMemberCardLookup && memberCardLookup && !cardLookupOpen ? (
          <button
            type="button"
            className="mt-2 min-h-12 w-full rounded border border-blue-400/40 bg-[#111111] px-3 text-left text-sm font-semibold text-blue-100 lg:landscape:hidden"
            onClick={() => setCardLookupOpen(true)}
          >
            {t("cashier.payment.reopenCardLookup")}
          </button>
        ) : null}
        {creditAccount ? (
          <div className="mt-2 rounded border border-amber-400/40 bg-[#111111] px-3 py-2 text-sm">
            {creditAccount.customerName ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-slate-300">
                    {t("cashier.credit.onAccountOf")}{" "}
                    <span className="font-semibold text-white">{creditAccount.customerName}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {t("cashier.credit.owes", {
                      amount: Number(creditAccount.owes || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
                    })}
                    {" · "}
                    {t("cashier.credit.available", {
                      amount: Number(creditAccount.available || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-blue-300 hover:bg-white/5"
                  onClick={creditAccount.onChange}
                >
                  {t("cashier.credit.change")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="min-h-11 w-full text-left font-semibold text-amber-200"
                onClick={creditAccount.onChange}
              >
                {t("cashier.credit.choose")}
              </button>
            )}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-2 content-start gap-2 min-[1100px]:min-h-40 min-[1100px]:flex-1 min-[1100px]:shrink-0 min-[1100px]:overflow-y-auto">
          {sortedMethods.map((method) => {
            const selected = selectedMethodId === method.id;
            const memberCard = isMemberCardPaymentMethod(method);
            const cash =
              String(method.kind || method.code || "").toUpperCase() === "CASH" ||
              /cash/i.test(method.name);
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => {
                  onSelectMethod(method.id);
                  if (memberCard) setCardLookupOpen(true);
                }}
                className={[
                  "flex min-h-[4.75rem] flex-col items-center justify-center rounded border bg-white px-2 text-slate-900 transition md:min-h-[6.5rem]",
                  selected
                    ? "border-blue-500 ring-2 ring-blue-400"
                    : "border-slate-200 hover:border-blue-300",
                ].join(" ")}
              >
                {memberCard ? <MemberCardIcon /> : cash ? <CashIcon /> : <WalletIcon />}
                <span className="mt-1 text-center text-[11px] font-bold leading-tight">
                  {methodLabel(method, memberCardLabel)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
