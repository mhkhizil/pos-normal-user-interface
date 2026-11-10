import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { KtvSession } from "@/core/domain/entities/Ktv";
import { ChosenModifier, Product, ProductVariant } from "@/core/domain/entities/Cashier";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { useGuestWalletManagement } from "@/core/presentation/hooks/useGuestWalletManagement";
import { useKtvManagement } from "@/core/presentation/hooks/useKtvManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { useUserManagement } from "@/core/presentation/hooks/useUserManagement";
import { useSalesOrderManagement } from "@/core/presentation/hooks/useSalesOrderManagement";
import { findMemberCardPaymentMethod } from "@/core/application/services/PosPaymentCatalog";
import { ProductMenu } from "./cashier/ProductMenu";
import { modifierPrintText } from "@/lib/printing/modifierText";
import { modifierExtra } from "@/lib/modifiers/choices";
import {
  getKtvWarning,
  hasSufficientWalletBalance,
  isOpenKtvSession,
} from "@/lib/ktv/session";
import { isUnspendableWalletStatus } from "@/lib/pos/guestWalletAmounts";
import { useDateFormatter } from "@/lib/i18n/formatters";
import { lineDisplayName } from "@/lib/pos/orderListDisplay";
import { toast } from "@/lib/toast";
import { cashierLabel } from "@/lib/printing/cashier";
import { receiptTotals } from "@/lib/printing/receiptTotals";
import { toMoney, withOrderTipOnFirstPayment } from "@/lib/pos/checkoutAdjustments";
import { slipRows } from "@/lib/spa/billLines";
import { ladyChargeDetail, splitLadyCharges } from "@/lib/ktv/ladyCharge";

export function KtvRoomPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roomId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") || "menu";
  const {
    rooms,
    quote,
    roomTabletMenu,
    roomTabletSession,
    isLoading: isKtvLoading,
    error: ktvError,
    fetchBoard,
    openSession,
    getQuote,
    pauseSession,
    resumeSession,
    closeSession,
    fetchRoomTabletMenu,
    fetchRoomTabletSession,
  } = useKtvManagement();
  const {
    paymentMethods,
    isLoading: isCashierLoading,
    fetchPaymentMethods,
    processCheckout,
  } = useCashier();
  const {
    orderLines,
    isLoading: isOrderLoading,
    fetchOrderLines,
    fetchOrderBill,
    addOrderLine,
    deleteOrderLine,
  } = useSalesOrderManagement();
  const { lookupCard, getWallet } = useGuestWalletManagement();
  const { user } = useAuth();
  const { requireCashierContext, activePosRegisterId, activeLocationId } =
    usePosWorkspace();
  const { formatDateTime } = useDateFormatter();
  const printer = usePrinterConnection(
    String(user?.tenantId || ""),
    activePosRegisterId,
    activeLocationId
  );
  const { users, loadUsers } = useUserManagement();
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [guestCount, setGuestCount] = useState("1");
  const [hostUserId, setHostUserId] = useState(user?.id || "");
  const [cardUid, setCardUid] = useState("");
  const [card, setCard] = useState<GuestCard | null>(null);
  const [wallet, setWallet] = useState<GuestWallet | null>(null);
  const [tipAmount, setTipAmount] = useState("0.0000");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAddedLineId, setLastAddedLineId] = useState<string | null>(null);
  const [showInsufficient, setShowInsufficient] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const room = rooms.find((item) => item.id === roomId);
  const openSessions = useMemo(
    () => (room?.sessions || []).filter(isOpenKtvSession),
    [room?.sessions]
  );
  const session =
    openSessions.find((item) => item.id === selectedSessionId) || null;
  const boardSessionEndsAt = openSessions[0]?.endsAt;
  const paymentMethod = findMemberCardPaymentMethod(paymentMethods);
  const warning = getKtvWarning(
    roomTabletSession?.endsAt || session?.endsAt || boardSessionEndsAt,
    nowMs
  );
  const isBusy = isKtvLoading || isCashierLoading || isOrderLoading;
  const roomMenu = useMemo(() => {
    const products: Product[] = [];
    const variantsByProductId: Record<string, ProductVariant[]> = {};
    roomTabletMenu?.categories.forEach((category) => {
      category.items.forEach((item) => {
        const productId = `room-tablet-${item.variantId}`;
        products.push(
          new Product({
            id: productId,
            categoryId: category.categoryId,
            name: item.name,
            basePrice: item.price,
            imageUrl: item.imageUrl,
            modifierGroups: item.modifierGroups,
          })
        );
        variantsByProductId[productId] = [
          new ProductVariant({
            id: item.variantId,
            productId,
            priceModifier: "0.0000",
            imageUrl: item.imageUrl,
          }),
        ];
      });
    });
    return { products, variantsByProductId };
  }, [roomTabletMenu]);

  const refreshSessionData = useCallback(
    async (target: KtvSession) => {
      await Promise.all([
        getQuote(target.id),
        target.salesOrderId
          ? fetchOrderLines(target.salesOrderId, { page: 1, limit: 200 })
          : Promise.resolve(),
      ]);
    },
    [fetchOrderLines, getQuote]
  );

  useEffect(() => {
    void Promise.all([
      fetchBoard(),
      fetchPaymentMethods(),
      loadUsers({ take: 100, skip: 0, role: "STAFF", sortBy: "name" }),
    ]);
  }, [fetchBoard, fetchPaymentMethods, loadUsers]);

  useEffect(() => {
    if (!card || !wallet) return;
    void Promise.all([fetchRoomTabletMenu(), fetchRoomTabletSession()]);
  }, [
    card,
    fetchRoomTabletMenu,
    fetchRoomTabletSession,
    wallet,
  ]);

  useEffect(() => {
    if (!session) return;
    void refreshSessionData(session);
  }, [refreshSessionData, session?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      if (session && card && wallet && document.visibilityState === "visible") {
        void Promise.all([getQuote(session.id), fetchRoomTabletSession()]);
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [card, fetchRoomTabletSession, getQuote, session, wallet]);

  useEffect(() => {
    if (view === "pay" && card && wallet) {
      setShowCloseConfirm(true);
    }
  }, [card, view, wallet]);

  const detectCard = useCallback(
    async (uid: string) => {
      setLocalError(null);
      try {
        const foundCard = await lookupCard(uid.trim());
        const foundWallet =
          foundCard.wallet || (await getWallet(foundCard.walletId));
        if (isUnspendableWalletStatus(foundWallet.status)) {
          throw new Error(t("ktv.errors.walletUnavailable"));
        }
        if (
          session?.guestWalletId &&
          foundWallet.id !== session.guestWalletId
        ) {
          throw new Error(t("ktv.errors.wrongSessionCard"));
        }
        setCardUid(uid);
        setCard(foundCard);
        setWallet(foundWallet);
        setNotice(t("ktv.cardAccepted"));
      } catch (caught) {
        setCard(null);
        setWallet(null);
        setLocalError(
          caught instanceof Error ? caught.message : t("ktv.errors.cardLookup")
        );
      }
    },
    [getWallet, lookupCard, session?.guestWalletId, t]
  );

  const { nfcSupported, nfcActive, nfcError, startNfc } = useCardCapture({
    enabled: !card,
    onRead: (uid) => void detectCard(uid),
  });

  const handleCardSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (cardUid.trim()) void detectCard(cardUid);
  };

  const handleAddProduct = async (
    product: Product,
    variantId: string,
    quantity: number,
    modifiers?: ChosenModifier[],
    note?: string
  ) => {
    if (!session?.salesOrderId || !wallet) {
      throw new Error(t("ktv.errors.sessionRequired"));
    }
    const variants = roomMenu.variantsByProductId[product.id] || [];
    const variant =
      variants.find((item) => item.id === variantId) || variants[0];
    if (!variant) throw new Error(t("cashier.productMenu.noVariant"));
    const unitPrice =
      Number(product.basePrice || 0) +
      Number(variant.priceModifier || 0) +
      modifierExtra(modifiers);
    const line = await addOrderLine(session.salesOrderId, {
      variantId: variant.id,
      quantity: Math.max(1, quantity).toFixed(4),
      unitPrice: unitPrice.toFixed(4),
      lineDiscount: "0.0000",
      ...(modifiers?.length ? { selectedModifiers: modifiers } : {}),
      ...(note ? { note } : {}),
    });
    setLastAddedLineId(line.id);
    const [nextQuote, nextTabletSession] = await Promise.all([
      getQuote(session.id),
      fetchRoomTabletSession(),
    ]);
    if (
      !hasSufficientWalletBalance(
        nextTabletSession.walletBalance || wallet.balance,
        nextQuote.runningTotal
      )
    ) {
      setShowInsufficient(true);
    } else {
      setNotice(t("ktv.itemAdded"));
    }
  };

  const removeLastItem = async () => {
    if (!lastAddedLineId || !session?.salesOrderId) {
      setShowInsufficient(false);
      return;
    }
    await deleteOrderLine(session.salesOrderId, lastAddedLineId);
    setLastAddedLineId(null);
    setShowInsufficient(false);
    await getQuote(session.id);
  };

  const openTopup = () => {
    if (!card || !wallet) return;
    navigate("/cards", {
      state: {
        cardNumber: card.cardUid,
        balance: wallet.balance,
        customerName: wallet.guestName,
        customerPhone: wallet.guestPhone,
        tenantId: wallet.tenantId,
        walletId: wallet.id,
      },
    });
  };

  const handlePauseResume = async () => {
    if (!session) return;
    if (session.sessionState === "PAUSED") {
      await resumeSession(session.id);
    } else {
      await pauseSession(session.id);
    }
    await fetchBoard();
  };

  const handleCheckout = async () => {
    if (!session?.salesOrderId || !card || !wallet || !paymentMethod) {
      setLocalError(t("ktv.errors.paymentUnavailable"));
      return;
    }
    setLocalError(null);
    try {
      const tipValue = Math.max(0, Number(tipAmount) || 0);
      const latestQuote = await getQuote(session.id);
      const total = Number(latestQuote.runningTotal || 0) + tipValue;
      if (!hasSufficientWalletBalance(wallet.balance, total)) {
        setShowInsufficient(true);
        return;
      }
      setShowCloseConfirm(false);
      const closedAt = new Date().toISOString();
      const finalQuote = await closeSession(session.id, {
        closedAt,
      });
      const result = await fetchOrderLines(session.salesOrderId, {
        page: 1,
        limit: 200,
      });
      // The ladies' own charges print as one row below the service charge, each
      // lady and her hours under it, rather than a line each among the items.
      const printedLines = result.lines.filter((line) => !line.voidedAt);
      const ladySplit = splitLadyCharges(printedLines);
      // The closed bill: the room's time, its tax and its service charge, so the
      // slip reads the way the cashier's receipt does.
      const bill = await fetchOrderBill(session.salesOrderId, {
        includeTax: true,
        includeServiceCharge: true,
      }).catch(() => null);
      const totals = receiptTotals(bill, result.lines);
      const context = await requireCashierContext();
      const finalTotal = Number(finalQuote.runningTotal || total) + tipValue;
      await processCheckout({
        tenantId: context.tenantId,
        locationId: context.locationId,
        posSessionId: context.posSessionId,
        salesChannel: "POS",
        serviceType: "DINE_IN",
        idempotencyKey: `ktv-${session.id}-${Date.now()}`,
        ...(tipValue > 0 ? { tipAmount: toMoney(tipValue) } : {}),
        items: result.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          lineDiscount: line.lineDiscount || "0.0000",
        })),
        payments: withOrderTipOnFirstPayment(
          [
            {
              paymentMethodId: paymentMethod.id,
              amount: finalTotal.toFixed(4),
              guestCardId: card.id,
            },
          ],
          tipValue
        ),
      });
      const endAt = finalQuote.asOf || closedAt;
      try {
        await printer.printReceipt({
          title: "RECEIPT",
          sale: true,
          place: "CHECKOUT",
          area: "KTV",
          showLogo: true,
          showPrices: true,
          receiptId: session.salesOrderId,
          cashier: cashierLabel(user),
          serviceType: "KTV",
          tableOrRoom: room?.roomNumber,
          paidAt: new Date().toLocaleString(),
          startTime: formatDateTime(session.openedAt),
          endTime: formatDateTime(endAt),
          startTimeLabel: t("receipt.startTime"),
          endTimeLabel: t("receipt.endTime"),
          lines: slipRows(ladySplit.items).map(({ line, quantity }) => {
            const modifiers = modifierPrintText(line.selectedModifiers);
            return {
              name: lineDisplayName(line) || line.productName || line.variantName || "Item",
              quantity: String(quantity || line.quantity || "1"),
              unitPrice: line.unitPrice?.trim() || undefined,
              modifiers: modifiers.names,
              modifierPrices: modifiers.prices,
            };
          }),
          // The ladies are left out of the subtotal here and added back below it, so
          // the money rows still add up to the total.
          ...(ladySplit.ladyCharge > 0 && totals.subtotal !== undefined
            ? {
                ...totals,
                subtotal: Math.max(0, Number(totals.subtotal) - ladySplit.ladyCharge).toFixed(4),
              }
            : totals),
          // The tip is inside the total below, so the slip says so.
          amounts: [
            ...(ladySplit.ladyCharge > 0
              ? [
                  {
                    label: t("receipt.ladyCharge"),
                    amount: ladySplit.ladyCharge.toFixed(4),
                    detail: ladySplit.ladies.map((lady) => ({
                      label: ladyChargeDetail(lady, t("receipt.ladyCharge")),
                      amount: lady.amount.toFixed(4),
                    })),
                  },
                ]
              : []),
            ...(tipValue > 0
              ? [{ label: t("receipt.tip"), amount: tipValue.toFixed(4) }]
              : []),
          ],
          total: finalTotal.toFixed(4),
          payments: [
            {
              name: paymentMethod.name || "Payment",
              amount: finalTotal.toFixed(4),
            },
          ],
        });
      } catch (printError) {
        toast.error(
          printError instanceof Error ? printError.message : t("receipt.printFailed")
        );
      }
      // The bill is paid: a card balance that cannot be read back is a warning,
      // never a failed payment.
      try {
        await getWallet(wallet.id);
      } catch {
        toast.info(t("receipt.cardBalanceStale"));
      }
      navigate("/ktv");
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("ktv.errors.checkout")
      );
    }
  };

  if (!room && rooms.length > 0) {
    return (
      <section className="grid h-full place-items-center bg-black text-white">
        <div className="text-center">
          <p>{t("ktv.errors.roomNotFound")}</p>
          <Button className="mt-3" onClick={() => navigate("/ktv")}>
            {t("ktv.backToBoard")}
          </Button>
        </div>
      </section>
    );
  }

  const handleOpenSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!room || !wallet) return;
    setLocalError(null);
    try {
      const context = await requireCashierContext();
      const created = await openSession({
        roomId: room.id,
        guestCount: Math.max(1, Number(guestCount) || 1),
        guestWalletId: wallet.id,
        ...(hostUserId ? { hostUserId } : {}),
        posRegisterId: context.posRegisterId,
        openedByPosSessionId: context.posSessionId,
        salesChannel: "POS",
      });
      setSelectedSessionId(created.id);
      await fetchBoard();
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("ktv.errors.openSession")
      );
    }
  };

  const warningEndsAt = roomTabletSession?.endsAt || session?.endsAt || boardSessionEndsAt;
  const visibleWarning = getKtvWarning(warningEndsAt, nowMs);

  if (!card || !wallet) {
    return (
      <section className="grid h-full place-items-center bg-[#080808] p-4 text-white">
        <form
          className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-950 p-6"
          onSubmit={handleCardSubmit}
        >
          <p className="text-sm text-slate-400">{room?.roomNumber}</p>
          {visibleWarning.level !== "NORMAL" ? (
            <p
              className={`rounded border px-3 py-2 text-sm ${
                visibleWarning.level === "EXPIRED"
                  ? "border-red-500 bg-red-950 text-red-200"
                  : "border-orange-400 bg-orange-950 text-orange-200"
              }`}
            >
              {visibleWarning.level === "EXPIRED"
                ? t("ktv.expired")
                : t("ktv.minutesRemaining", {
                    count: visibleWarning.remainingMinutes,
                  })}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold">{t("ktv.tapCardTitle")}</h1>
          <p className="text-sm text-slate-400">{t("ktv.tapCardDescription")}</p>
          <input
            value={cardUid}
            onChange={(event) => setCardUid(event.target.value)}
            placeholder={t("ktv.cardUid")}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-3"
          />
          <Button fullWidth type="submit" disabled={!cardUid.trim()}>
            {t("ktv.checkCard")}
          </Button>
          {nfcSupported ? (
            <Button
              fullWidth
              variant="secondary"
              disabled={nfcActive}
              onClick={() => void startNfc()}
            >
              {nfcActive ? t("ktv.nfcReady") : t("ktv.enableNfc")}
            </Button>
          ) : null}
          {(localError || nfcError || ktvError) && (
            <p className="text-sm text-red-300">
              {localError || nfcError || ktvError}
            </p>
          )}
        </form>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="grid h-full place-items-center bg-[#080808] p-4 text-white">
        <div className="w-full max-w-lg space-y-4">
          <p className="text-emerald-300">
            {t("ktv.balance", { amount: wallet.balance })}
          </p>
          <h1 className="text-2xl font-bold">{t("ktv.selectSession")}</h1>
          {openSessions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-4 text-left"
              onClick={() => setSelectedSessionId(item.id)}
            >
              {t("ktv.sessionOption", {
                time: new Date(item.openedAt).toLocaleTimeString(),
              })}
            </button>
          ))}
          <form className="space-y-3 rounded-lg border border-slate-700 p-4" onSubmit={handleOpenSession}>
            <p className="font-bold">{t("ktv.newSession")}</p>
            <label className="block text-sm">
              {t("ktv.guestCountLabel")}
              <input
                type="number"
                min={1}
                value={guestCount}
                onChange={(event) => setGuestCount(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              {t("ktv.waiter")}
              <select
                value={hostUserId}
                onChange={(event) => setHostUserId(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
              >
                <option value="">{t("ktv.noWaiter")}</option>
                {users.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.nickname || staff.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">{t("ktv.startSession")}</Button>
          </form>
          {localError ? <p className="text-sm text-red-300">{localError}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(24rem,1fr)_minmax(24rem,1fr)] overflow-y-auto bg-[#080808] text-white md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-1 md:overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-r border-white/10 bg-slate-950 p-4">
        <div
          className={`rounded-lg border p-3 ${
            warning.level === "EXPIRED"
              ? "border-red-500 bg-red-950/50"
              : warning.level === "WARNING"
                ? "border-orange-400 bg-orange-950/40"
                : "border-slate-700"
          }`}
        >
          <p className="text-xl font-bold">{room?.roomNumber}</p>
          <p className="text-sm text-slate-400">{room?.name}</p>
          <p className="mt-2 text-sm">
            {warning.level === "EXPIRED"
              ? t("ktv.expired")
              : t("ktv.minutesRemaining", {
                  count: warning.remainingMinutes,
                })}
          </p>
        </div>
        {openSessions.length > 1 ? (
          <select
            value={session.id}
            onChange={(event) => setSelectedSessionId(event.target.value)}
            className="mt-3 rounded border border-slate-700 bg-slate-900 px-3 py-2"
          >
            {openSessions.map((item) => (
              <option key={item.id} value={item.id}>
                {t("ktv.sessionOption", {
                  time: new Date(item.openedAt).toLocaleTimeString(),
                })}
              </option>
            ))}
          </select>
        ) : null}
        <div className="mt-3 rounded border border-slate-800 p-3 text-sm">
          <p>{wallet.guestName}</p>
          <p className="text-emerald-300">
            {t("ktv.balance", {
              amount: roomTabletSession?.walletBalance || wallet.balance,
            })}
          </p>
          <p className="mt-2 text-slate-400">
            {t("ktv.runningTotal", {
              amount: quote?.runningTotal || "0.0000",
            })}
          </p>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {(roomTabletSession?.lines || []).map((line, index) => (
            <div
              key={`${line.name}-${index}`}
              className="mb-2 flex justify-between rounded bg-slate-900 p-2 text-xs"
            >
              <span>{line.name}</span>
              <span>{Number(line.quantity)}</span>
            </div>
          ))}
        </div>
        <label className="mt-3 text-sm">
          {t("ktv.tip")}
          <input
            type="number"
            min="0"
            value={tipAmount}
            onChange={(event) => setTipAmount(event.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => void handlePauseResume()}
          >
            {session.sessionState === "PAUSED"
              ? t("ktv.resume")
              : t("ktv.pause")}
          </Button>
          <Button onClick={() => setShowCloseConfirm(true)}>
            {t("ktv.pay")}
          </Button>
        </div>
      </aside>
      <main className="relative min-h-0 min-w-0 p-4">
        {view === "menu" ? (
          <ProductMenu
            products={roomMenu.products}
            variantsByProductId={roomMenu.variantsByProductId}
            onLoadVariants={async (productId) =>
              roomMenu.variantsByProductId[productId] || []
            }
            onAdd={handleAddProduct}
            offerOptions
            quickNotes={roomTabletMenu?.quickNotes}
            onClose={() => setSearchParams({ view: "orders" })}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <h2 className="text-xl font-bold">{t("ktv.orderSummary")}</h2>
              <p className="mt-2 text-slate-400">
                {t("ktv.itemsCount", { count: orderLines.length })}
              </p>
              <Button
                className="mt-4"
                onClick={() => setSearchParams({ view: "menu" })}
              >
                {t("ktv.openMenu")}
              </Button>
            </div>
          </div>
        )}
        {(localError || notice) && (
          <p
            className={`absolute bottom-4 right-4 rounded border p-3 text-sm ${
              localError
                ? "border-red-500 bg-red-950 text-red-200"
                : "border-emerald-500 bg-emerald-950 text-emerald-200"
            }`}
          >
            {localError || notice}
          </p>
        )}
      </main>

      {showInsufficient ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-lg border border-orange-400 bg-slate-950 p-5">
            <h2 className="text-lg font-bold text-orange-300">
              {t("ktv.insufficientTitle")}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {t("ktv.insufficientDescription")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void removeLastItem()}>
                {t("ktv.removeLastItem")}
              </Button>
              <Button onClick={openTopup}>{t("ktv.topUpCard")}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {showCloseConfirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 p-5">
            <h2 className="text-lg font-bold">{t("ktv.confirmCheckout")}</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p>{t("ktv.roomCharge", { amount: quote?.roomCharge || "0" })}</p>
              <p>{t("ktv.fnbCharge", { amount: quote?.fnbCharge || "0" })}</p>
              <p className="font-bold text-white">
                {t("ktv.runningTotal", {
                  amount: quote?.runningTotal || "0",
                })}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowCloseConfirm(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button isLoading={isBusy} onClick={() => void handleCheckout()}>
                {t("ktv.confirmPay")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
