import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { CardCaptureStatus } from "@/components/ui/CardCaptureStatus";
import { SettleSalesOrderResultDTO } from "@/core/application/dtos/SalesOrderDTO";
import {
  findMemberCardPaymentMethod,
  LOCAL_MEMBER_CARD_METHOD_ID,
} from "@/core/application/services/PosPaymentCatalog";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { SpaRoom, SpaSession } from "@/core/domain/entities/Spa";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { useGuestWalletManagement } from "@/core/presentation/hooks/useGuestWalletManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { useSalesOrderManagement } from "@/core/presentation/hooks/useSalesOrderManagement";
import { useSpaManagement } from "@/core/presentation/hooks/useSpaManagement";
import { getKtvWarning } from "@/lib/ktv/session";
import { isUnspendableWalletStatus } from "@/lib/pos/guestWalletAmounts";
import {
  buildSpaSettlePayments,
  cardCanCover,
  estimateCardCharge,
} from "@/lib/spa/payment";
import {
  findActiveSpaSession,
  isOpenSpaSession,
  spaSettleKey,
  treatmentLengthOptions,
} from "@/lib/spa/session";
import { ProductMenu } from "./cashier/ProductMenu";
import { SpaRoomTile } from "./spa/SpaRoomTile";

type SpaStep = "card" | "rooms" | "sessions" | "menu" | "pay";

const RESUME_KEY = "spa-pos-resume";
type ResumeState = { roomId?: string; session?: SpaSession };

const readResume = (): ResumeState | null => {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    return raw ? (JSON.parse(raw) as ResumeState) : null;
  } catch {
    return null;
  }
};
const writeResume = (value: ResumeState | null) => {
  try {
    if (value) window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // Storage can be blocked; the cashier then re-selects the room after a top-up.
  }
};

const emptyRoomForm = {
  roomNumber: "",
  name: "",
  capacity: "1",
  rateVariantId: "",
  treatmentMinutes: "60",
  graceMinutes: "15",
};

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function SpaBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    rooms,
    quote,
    isLoading,
    error,
    fetchBoard,
    createRoom,
    updateRoom,
    deleteRoom,
    markRoomReady,
    openSession,
    getQuote,
    pauseSession,
    resumeSession,
    closeSession,
    clearQuote,
  } = useSpaManagement();
  const {
    products,
    variantsByProductId,
    paymentMethods,
    fetchProducts,
    fetchProductVariants,
    fetchPaymentMethods,
  } = useCashier();
  const { orderLines, fetchOrderLines, addOrderLine, deleteOrderLine, settleOrder } =
    useSalesOrderManagement();
  const { lookupCard, getWallet } = useGuestWalletManagement();
  const { activeLocationId, requireCashierContext, isWorkspaceReady } =
    usePosWorkspace();

  const [step, setStep] = useState<SpaStep>("card");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "ACTIVE">("ALL");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [session, setSession] = useState<SpaSession | null>(null);
  const [guestCount, setGuestCount] = useState("1");
  const [plannedMinutes, setPlannedMinutes] = useState(60);
  const [cardUid, setCardUid] = useState("");
  const [card, setCard] = useState<GuestCard | null>(null);
  const [wallet, setWallet] = useState<GuestWallet | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAddedLineId, setLastAddedLineId] = useState<string | null>(null);
  const [showInsufficient, setShowInsufficient] = useState(false);
  const [tip, setTip] = useState("");
  const [splitCash, setSplitCash] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [paid, setPaid] = useState<SettleSalesOrderResultDTO | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<SpaRoom | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);

  const room = rooms.find((item) => item.id === selectedRoomId) || null;
  const openSessions = useMemo(
    () => (room?.sessions || []).filter(isOpenSpaSession),
    [room?.sessions]
  );
  const billClosed = session?.sessionState === "CLOSED";
  const cardMethod = findMemberCardPaymentMethod(paymentMethods);
  const cashMethod = paymentMethods.find(
    (method) => String(method.kind || "").toUpperCase() === "CASH"
  );
  const tipValue = Math.max(0, Number(tip) || 0);
  const cashValue = splitCash ? Math.max(0, Number(cashAmount) || 0) : 0;
  const estimatedCard = estimateCardCharge({
    runningTotal: quote?.runningTotal || 0,
    discountBps: wallet?.discountBpsSnapshot,
    tip: tipValue,
    cash: cashValue,
  });
  const itemNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const product of products) {
      for (const variant of variantsByProductId[product.id] || []) {
        names[variant.id] = product.name;
      }
    }
    if (room) names[room.rateVariantId] = t("spa.treatmentCharge");
    return names;
  }, [products, room, t, variantsByProductId]);
  const visibleRooms = useMemo(
    () =>
      rooms.filter((item) => {
        const active = Boolean(findActiveSpaSession(item));
        if (filter === "ACTIVE") return active;
        if (filter === "AVAILABLE") return !active && item.status === "AVAILABLE";
        return true;
      }),
    [filter, rooms]
  );

  const loadBill = useCallback(
    async (target: SpaSession) => {
      await Promise.all([
        getQuote(target.id),
        target.salesOrderId
          ? fetchOrderLines(target.salesOrderId, { page: 1, limit: 200 })
          : Promise.resolve(),
      ]);
    },
    [fetchOrderLines, getQuote]
  );

  const acceptCard = useCallback(
    async (uid: string) => {
      const foundCard = await lookupCard(uid.trim());
      const foundWallet = foundCard.wallet || (await getWallet(foundCard.walletId));
      if (isUnspendableWalletStatus(foundWallet.status)) {
        throw new Error(t("spa.errors.walletUnavailable"));
      }
      setCard(foundCard);
      setWallet(foundWallet);
      setCardUid(foundCard.cardUid);
      return { foundCard, foundWallet };
    },
    [getWallet, lookupCard, t]
  );

  useEffect(() => {
    void fetchBoard(activeLocationId || undefined);
    void fetchProducts({ page: 1, limit: 100 });
    void fetchPaymentMethods();
  }, [activeLocationId, fetchBoard, fetchPaymentMethods, fetchProducts]);

  useEffect(() => {
    const returned = location.state as { cardNumber?: string } | null;
    if (!returned?.cardNumber) return;
    const resume = readResume();
    void acceptCard(returned.cardNumber)
      .then(async () => {
        if (resume?.session) {
          setSelectedRoomId(resume.roomId || resume.session.roomId || "");
          setSession(resume.session);
          await loadBill(resume.session);
          setStep(resume.session.sessionState === "CLOSED" ? "pay" : "menu");
        } else {
          setStep("rooms");
        }
        setNotice(t("spa.cardAccepted"));
      })
      .catch(() => setActionError(t("spa.errors.cardLookup")));
  }, [acceptCard, loadBill, location.state, t]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchBoard(activeLocationId || undefined);
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [activeLocationId, fetchBoard]);

  const handleCardLookup = async (uid = cardUid) => {
    if (!uid.trim()) return;
    setActionError(null);
    try {
      await acceptCard(uid);
      setNotice(t("spa.cardAccepted"));
    } catch (caught) {
      setCard(null);
      setWallet(null);
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.cardLookup"));
    }
  };

  const { nfcSupported, nfcActive, nfcError, lastUid, startNfc } = useCardCapture({
    enabled: step === "card",
    onRead: (uid) => void handleCardLookup(uid),
  });

  const openTopup = () => {
    if (!card || !wallet) return;
    writeResume(session ? { roomId: selectedRoomId, session } : null);
    navigate("/cards", {
      state: {
        cardNumber: card.cardUid,
        balance: wallet.balance,
        customerName: wallet.guestName,
        customerPhone: wallet.guestPhone,
        tenantId: wallet.tenantId,
        walletId: wallet.id,
        returnTo: "/spa",
      },
    });
  };

  const selectRoom = (next: SpaRoom) => {
    setSelectedRoomId(next.id);
    setSession(null);
    clearQuote();
    setGuestCount("1");
    setPlannedMinutes(treatmentLengthOptions(next)[0]);
    setStep("sessions");
  };

  const selectSession = async (next: SpaSession) => {
    if (next.guestWalletId && wallet && next.guestWalletId !== wallet.id) {
      setActionError(t("spa.errors.wrongSessionCard"));
      return;
    }
    setActionError(null);
    setSession(next);
    setPaid(null);
    setTip("");
    setCashAmount("");
    setSplitCash(false);
    await loadBill(next);
    setStep("menu");
  };

  const handleOpenSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!room || !wallet) return;
    setActionError(null);
    try {
      const context = await requireCashierContext();
      const created = await openSession({
        roomId: room.id,
        guestWalletId: wallet.id,
        guestCount: Math.max(1, Number(guestCount) || 1),
        plannedMinutes,
        posRegisterId: context.posRegisterId,
        openedByPosSessionId: context.posSessionId,
        salesChannel: "POS",
      });
      await fetchBoard(activeLocationId || undefined);
      await selectSession(created);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.openSession"));
    }
  };

  const handleAddProduct = async (
    product: (typeof products)[number],
    variantId: string,
    quantity: number
  ) => {
    if (!session?.salesOrderId || !wallet || billClosed) {
      throw new Error(t("spa.errors.sessionRequired"));
    }
    const variants = variantsByProductId[product.id]?.length
      ? variantsByProductId[product.id]
      : await fetchProductVariants(product.id);
    const variant = variants.find((item) => item.id === variantId) || variants[0];
    if (!variant) throw new Error(t("cashier.productMenu.noVariant"));
    const unitPrice = Number(product.basePrice || 0) + Number(variant.priceModifier || 0);
    const line = await addOrderLine(session.salesOrderId, {
      variantId: variant.id,
      quantity: Math.max(1, quantity).toFixed(4),
      unitPrice: unitPrice.toFixed(4),
      lineDiscount: "0.0000",
    });
    setLastAddedLineId(line.id);
    const nextQuote = await getQuote(session.id);
    const estimate = estimateCardCharge({
      runningTotal: nextQuote.runningTotal,
      discountBps: wallet.discountBpsSnapshot,
    });
    if (!cardCanCover(wallet, estimate)) {
      setShowInsufficient(true);
    } else {
      setNotice(t("spa.itemAdded"));
    }
  };

  const removeLastItem = async () => {
    setShowInsufficient(false);
    if (!lastAddedLineId || !session?.salesOrderId) return;
    await deleteOrderLine(session.salesOrderId, lastAddedLineId);
    setLastAddedLineId(null);
    await getQuote(session.id);
  };

  const togglePause = async () => {
    if (!session || billClosed) return;
    const updated =
      session.sessionState === "PAUSED"
        ? await resumeSession(session.id)
        : await pauseSession(session.id);
    setSession({ ...session, ...updated, salesOrderId: session.salesOrderId });
    await getQuote(session.id);
  };

  const handlePay = async () => {
    if (!session?.salesOrderId || !card || !wallet) {
      setActionError(t("spa.errors.sessionRequired"));
      return;
    }
    if (!cardMethod || cardMethod.id === LOCAL_MEMBER_CARD_METHOD_ID) {
      setActionError(t("spa.errors.paymentUnavailable"));
      return;
    }
    if (cashValue > 0 && !cashMethod) {
      setActionError(t("spa.errors.cashUnavailable"));
      return;
    }
    setActionError(null);
    setIsPaying(true);
    try {
      const context = await requireCashierContext();
      if (!billClosed) {
        const latest = await getQuote(session.id);
        const estimate = estimateCardCharge({
          runningTotal: latest.runningTotal,
          discountBps: wallet.discountBpsSnapshot,
          tip: tipValue,
          cash: cashValue,
        });
        if (!cardCanCover(wallet, estimate)) {
          setShowInsufficient(true);
          return;
        }
        await closeSession(session.id, {});
        setSession({ ...session, sessionState: "CLOSED" });
      }
      const result = await settleOrder(session.salesOrderId, {
        payments: buildSpaSettlePayments({
          cardMethodId: cardMethod.id,
          guestCardId: card.id,
          cashMethodId: cashMethod?.id,
          cashAmount: cashValue,
        }),
        posSessionId: context.posSessionId,
        ...(tipValue > 0 ? { tipAmount: tipValue.toFixed(4) } : {}),
        idempotencyKey: spaSettleKey(session.id),
      });
      setPaid(result);
      writeResume(null);
      setWallet(await getWallet(wallet.id));
      await fetchBoard(activeLocationId || undefined);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.pay"));
    } finally {
      setIsPaying(false);
    }
  };

  const startNextGuest = () => {
    setPaid(null);
    setSession(null);
    clearQuote();
    setSelectedRoomId("");
    setCard(null);
    setWallet(null);
    setCardUid("");
    setNotice(null);
    setStep("card");
  };

  const handleSaveRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeLocationId) return;
    setActionError(null);
    const minutes = Number(roomForm.treatmentMinutes);
    const terms = {
      roomNumber: roomForm.roomNumber.trim(),
      name: roomForm.name.trim(),
      capacity: Number(roomForm.capacity),
      rateVariantId: roomForm.rateVariantId.trim(),
      minimumMinutes: minutes,
      incrementMinutes: minutes,
      graceMinutes: Number(roomForm.graceMinutes),
      roundingMode: "DOWN" as const,
    };
    try {
      if (editingRoom) await updateRoom(editingRoom.id, terms);
      else await createRoom({ ...terms, locationId: activeLocationId });
      setRoomForm(emptyRoomForm);
      setEditingRoom(null);
      setShowRoomForm(false);
      await fetchBoard(activeLocationId || undefined);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.saveRoom"));
    }
  };

  const openRoomManager = (managed: SpaRoom) => {
    setEditingRoom(managed);
    setRoomForm({
      roomNumber: managed.roomNumber,
      name: managed.name,
      capacity: String(managed.capacity),
      rateVariantId: managed.rateVariantId,
      treatmentMinutes: String(managed.minimumMinutes),
      graceMinutes: String(managed.graceMinutes),
    });
    setShowRoomForm(true);
  };

  const goBack = () => {
    setActionError(null);
    if (step === "pay") setStep(billClosed ? "pay" : "menu");
    else if (step === "menu") setStep("sessions");
    else if (step === "sessions") setStep("rooms");
    else setStep("card");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#080808] p-4 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h1 className="text-xl font-bold">{t("spa.boardTitle")}</h1>
          <p className="text-sm text-slate-400">{t(`spa.steps.${step}`)}</p>
        </div>
        <div className="flex gap-2">
          {step !== "card" && !(step === "pay" && billClosed) && !paid ? (
            <Button variant="secondary" onClick={goBack}>
              {t("cardTopup.back")}
            </Button>
          ) : null}
          <Button
            disabled={!isWorkspaceReady}
            onClick={() => {
              setEditingRoom(null);
              setRoomForm(emptyRoomForm);
              setShowRoomForm(true);
            }}
          >
            {t("spa.addRoom")}
          </Button>
        </div>
      </header>

      {(error || actionError || notice) && (
        <p
          className={`my-3 rounded border p-3 text-sm ${
            actionError || error
              ? "border-red-500/60 bg-red-950/50 text-red-200"
              : "border-emerald-500/60 bg-emerald-950/40 text-emerald-200"
          }`}
        >
          {actionError || error || notice}
        </p>
      )}

      {step === "card" ? (
        <form
          className="mx-auto mt-10 w-full max-w-md space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCardLookup();
          }}
        >
          <h2 className="text-2xl font-bold">{t("spa.cardTitle")}</h2>
          <p className="text-sm text-slate-400">{t("spa.cardDescription")}</p>
          <CardCaptureStatus
            nfcSupported={nfcSupported}
            nfcActive={nfcActive}
            nfcError={nfcError}
            lastUid={lastUid}
            onEnableNfc={() => void startNfc()}
          />
          <input
            value={cardUid}
            onChange={(event) => setCardUid(event.target.value)}
            placeholder={t("spa.cardUid")}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-3"
          />
          <Button fullWidth type="submit" disabled={!cardUid.trim()}>
            {t("spa.checkCard")}
          </Button>
          {wallet && card ? (
            <div className="rounded border border-slate-700 p-4">
              <p className="font-semibold">{wallet.guestName}</p>
              <p className="text-sm text-slate-400">
                {t("spa.tier", {
                  tier: wallet.tierNameSnapshot,
                  percent: (wallet.discountBpsSnapshot || 0) / 100,
                })}
              </p>
              <p className="text-emerald-300">
                {t("spa.balance", { amount: money(wallet.balance) })}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={openTopup}>
                  {t("spa.topUpCard")}
                </Button>
                <Button onClick={() => setStep("rooms")}>{t("spa.selectRoom")}</Button>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}

      {step === "rooms" ? (
        <>
          <div className="my-3 flex gap-2">
            {(["ALL", "AVAILABLE", "ACTIVE"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded px-3 py-2 text-sm font-semibold ${
                  filter === value ? "bg-teal-600" : "bg-slate-800"
                }`}
                onClick={() => setFilter(value)}
              >
                {t(`spa.filters.${value.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleRooms.length === 0 ? (
              <p className="mt-10 text-center text-slate-400">{t("spa.noRooms")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {visibleRooms.map((item) => (
                  <SpaRoomTile
                    key={item.id}
                    room={item}
                    nowMs={nowMs}
                    onSelect={() => selectRoom(item)}
                    onReady={() => void markRoomReady(item.id)}
                    onManage={() => openRoomManager(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      {step === "sessions" && room ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {openSessions.map((item) => {
            const warning = getKtvWarning(item.endsAt, nowMs);
            return (
            <button
              key={item.id}
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-left"
              onClick={() => void selectSession(item)}
            >
              <p className="text-lg font-bold">{room.roomNumber}</p>
              <p className="text-sm text-slate-300">
                {t("spa.sessionOption", {
                  time: new Date(item.openedAt).toLocaleTimeString(),
                  count: item.guestCount,
                })}
              </p>
              <p className="mt-2 text-sm">
                {warning.level === "EXPIRED"
                  ? t("spa.timeUp")
                  : item.endsAt
                    ? t("spa.minutesRemaining", { count: warning.remainingMinutes })
                    : t(`spa.status.${item.sessionState.toLowerCase()}`)}
              </p>
            </button>
            );
          })}
          {openSessions.length === 0 && room.status === "AVAILABLE" ? (
            <form
              className="space-y-3 rounded-lg border border-teal-500 bg-slate-900 p-4"
              onSubmit={handleOpenSession}
            >
              <p className="font-bold">{t("spa.newSession", { room: room.roomNumber })}</p>
              <p className="text-sm text-slate-300">{t("spa.treatmentLength")}</p>
              <div className="flex flex-wrap gap-2">
                {treatmentLengthOptions(room).map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={`rounded px-3 py-2 text-sm font-semibold ${
                      plannedMinutes === minutes ? "bg-teal-600" : "bg-slate-800"
                    }`}
                    onClick={() => setPlannedMinutes(minutes)}
                  >
                    {t("spa.treatmentMinutes", { count: minutes })}
                  </button>
                ))}
              </div>
              <label className="block text-sm text-slate-300">
                {t("spa.guestCountLabel")}
                <input
                  type="number"
                  min={1}
                  max={room.capacity}
                  value={guestCount}
                  onChange={(event) => setGuestCount(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <Button type="submit" isLoading={isLoading}>
                {t("spa.startSession")}
              </Button>
            </form>
          ) : null}
          {openSessions.length === 0 && room.status !== "AVAILABLE" ? (
            <p className="text-slate-400">
              {t("spa.roomNotAvailable", {
                status: t(`spa.status.${room.status.toLowerCase()}`),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {(step === "menu" || step === "pay") && session ? (
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="space-y-3 rounded-lg border border-slate-800 p-4">
            <p className="text-lg font-bold">{room?.roomNumber || quote?.roomNumber}</p>
            <p className="text-emerald-300">
              {t("spa.balance", { amount: money(wallet?.balance) })}
            </p>
            <div className="space-y-1 text-sm">
              <p className="flex justify-between">
                <span>{t("spa.treatmentCharge")}</span>
                <span>{money(quote?.treatmentCharge)}</span>
              </p>
              <p className="flex justify-between">
                <span>{t("spa.servicesCharge")}</span>
                <span>{money(quote?.servicesCharge)}</span>
              </p>
              <p className="flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span>{t("spa.runningTotal")}</span>
                <span>{money(quote?.runningTotal)}</span>
              </p>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {orderLines.length === 0 ? (
                <p className="text-xs text-slate-500">{t("spa.noLines")}</p>
              ) : (
                orderLines.map((line) => (
                  <div key={line.id} className="flex justify-between text-sm">
                    <span className="truncate">
                      {line.productName || itemNames[line.variantId] || t("spa.item")}
                    </span>
                    <span>× {Number(line.quantity)}</span>
                  </div>
                ))
              )}
            </div>
            {!billClosed ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => void togglePause()}>
                  {session.sessionState === "PAUSED" ? t("spa.resume") : t("spa.pause")}
                </Button>
                <Button onClick={() => setStep(step === "menu" ? "pay" : "menu")}>
                  {step === "menu" ? t("spa.goToPay") : t("spa.addServices")}
                </Button>
              </div>
            ) : (
              <p className="rounded border border-amber-500/60 bg-amber-950/40 p-2 text-xs text-amber-200">
                {t("spa.billClosed")}
              </p>
            )}
          </aside>

          {step === "menu" ? (
            <ProductMenu
              products={products}
              variantsByProductId={variantsByProductId}
              onLoadVariants={fetchProductVariants}
              onAdd={handleAddProduct}
              onClose={() => setStep("pay")}
            />
          ) : paid ? (
            <div className="rounded-lg border border-emerald-500 p-5">
              <h2 className="text-lg font-bold text-emerald-300">{t("spa.paidTitle")}</h2>
              <p className="mt-3">
                {t("spa.paidSummary", {
                  amount: money(paid.grandTotal),
                  order: paid.orderNumber,
                })}
              </p>
              {Number(paid.change) > 0 ? (
                <p>{t("spa.change", { amount: money(paid.change) })}</p>
              ) : null}
              <p className="mt-2 text-sm text-slate-400">
                {t("spa.balance", { amount: money(wallet?.balance) })}
              </p>
              <Button className="mt-4" onClick={startNextGuest}>
                {t("spa.nextGuest")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-700 p-5">
              <h2 className="text-lg font-bold">{t("spa.payTitle")}</h2>
              {wallet?.discountBpsSnapshot ? (
                <p className="text-sm text-teal-300">
                  {t("spa.memberDiscount", {
                    tier: wallet.tierNameSnapshot,
                    percent: wallet.discountBpsSnapshot / 100,
                  })}
                </p>
              ) : null}
              <label className="block text-sm">
                {t("spa.tip")}
                <input
                  type="number"
                  min={0}
                  value={tip}
                  onChange={(event) => setTip(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={splitCash}
                  onChange={(event) => setSplitCash(event.target.checked)}
                />
                {t("spa.splitCash")}
              </label>
              {splitCash ? (
                <label className="block text-sm">
                  {t("spa.cashAmount")}
                  <input
                    type="number"
                    min={0}
                    value={cashAmount}
                    onChange={(event) => setCashAmount(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                  />
                </label>
              ) : null}
              <p className="text-sm text-slate-300">
                {t("spa.estimatedCard", { amount: money(estimatedCard) })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={openTopup}>
                  {t("spa.topUpCard")}
                </Button>
                <Button isLoading={isPaying} onClick={() => void handlePay()}>
                  {billClosed ? t("spa.retryPay") : t("spa.confirmPay")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showInsufficient ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-lg border border-orange-400 bg-slate-950 p-5">
            <h2 className="text-lg font-bold text-orange-300">{t("spa.insufficientTitle")}</h2>
            <p className="mt-2 text-sm text-slate-300">{t("spa.insufficientDescription")}</p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={() => void removeLastItem()}>
                {t("spa.removeLastItem")}
              </Button>
              <Button onClick={openTopup}>{t("spa.topUpCard")}</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowInsufficient(false);
                  setSplitCash(true);
                  setStep("pay");
                }}
              >
                {t("spa.payRestInCash")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showRoomForm ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <form
            className="grid w-full max-w-2xl grid-cols-2 gap-3 rounded-lg border border-slate-700 bg-slate-950 p-5"
            onSubmit={handleSaveRoom}
          >
            <h2 className="col-span-2 text-lg font-bold">
              {editingRoom ? t("spa.editRoom") : t("spa.addRoom")}
            </h2>
            {(
              [
                ["roomNumber", "spa.roomNumber"],
                ["name", "spa.roomName"],
                ["capacity", "spa.capacityLabel"],
                ["rateVariantId", "spa.rateVariant"],
                ["treatmentMinutes", "spa.treatmentLengthLabel"],
                ["graceMinutes", "spa.graceMinutes"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {t(label)}
                <input
                  value={roomForm[key]}
                  onChange={(event) =>
                    setRoomForm((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                  required={key !== "name"}
                />
              </label>
            ))}
            <p className="col-span-2 text-xs text-slate-400">{t("spa.rateHint")}</p>
            <div className="col-span-2 flex justify-end gap-2">
              {editingRoom ? (
                <Button
                  variant="destructive"
                  disabled={Boolean(findActiveSpaSession(editingRoom))}
                  onClick={() =>
                    void deleteRoom(editingRoom.id).then(() => setShowRoomForm(false))
                  }
                >
                  {t("spa.retireRoom")}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setShowRoomForm(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" isLoading={isLoading}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
