import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { SettleSalesOrderResultDTO } from "@/core/application/dtos/SalesOrderDTO";
import {
  findMemberCardPaymentMethod,
  LOCAL_MEMBER_CARD_METHOD_ID,
} from "@/core/application/services/PosPaymentCatalog";
import { Product, SalesOrderLine } from "@/core/domain/entities/Cashier";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { SpaRoom, SpaSession } from "@/core/domain/entities/Spa";
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
  addPending,
  changePending,
  PendingItem,
  pendingTotal,
} from "@/lib/spa/pending";
import {
  findActiveSpaSession,
  isOpenSpaSession,
  spaSettleKey,
  sessionMinutes,
} from "@/lib/spa/session";
import { ProductMenu } from "./cashier/ProductMenu";
import { CardTapDialog } from "./spa/CardTapDialog";
import { SpaBillPanel } from "./spa/SpaBillPanel";
import { SpaRoomTile } from "./spa/SpaRoomTile";

type SpaStep = "rooms" | "sessions" | "menu" | "pay";
type CardAction = "add" | "open" | "extend" | "pay";

const RESUME_KEY = "spa-pos-resume";
type ResumeState = { roomId?: string; session?: SpaSession; pending?: PendingItem[] };

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
    extendSession,
    chargeItems,
    refundLine,
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
  const {
    orderLines,
    fetchOrderLines,
    addOrderLine,
    updateOrderLine,
    deleteOrderLine,
    settleOrder,
  } = useSalesOrderManagement();
  const { lookupCard, getWallet } = useGuestWalletManagement();
  const { activeLocationId, requireCashierContext, isWorkspaceReady } =
    usePosWorkspace();

  const [step, setStep] = useState<SpaStep>("rooms");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "ACTIVE">("ALL");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [session, setSession] = useState<SpaSession | null>(null);
  const [guestCount, setGuestCount] = useState("1");
  const [sessionCount, setSessionCount] = useState(1);
  const [card, setCard] = useState<GuestCard | null>(null);
  const [wallet, setWallet] = useState<GuestWallet | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [cardPrompt, setCardPrompt] = useState<CardAction | null>(null);
  const [cardPromptError, setCardPromptError] = useState<string | null>(null);
  const [isCheckingCard, setIsCheckingCard] = useState(false);
  const [balanceWarning, setBalanceWarning] = useState<GuestWallet | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tip, setTip] = useState("");
  const [splitCash, setSplitCash] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [paid, setPaid] = useState<SettleSalesOrderResultDTO | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [extendCount, setExtendCount] = useState(1);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const tapKeys = useRef<Partial<Record<CardAction, string>>>({});
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<SpaRoom | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);

  const room = rooms.find((item) => item.id === selectedRoomId) || null;
  const openSessions = useMemo(
    () => (room?.sessions || []).filter(isOpenSpaSession),
    [room?.sessions]
  );
  const billClosed = session?.sessionState === "CLOSED";
  const liveSession = room?.sessions.find((item) => item.id === session?.id);
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
  const pendingByProduct = useMemo(
    () =>
      pending.reduce<Record<string, number>>((counts, item) => {
        counts[item.productId] = (counts[item.productId] || 0) + item.quantity;
        return counts;
      }, {}),
    [pending]
  );
  const treatmentOptions = useMemo(() => {
    const spaFirst = (name?: string) => (/spa|treat|massage/i.test(name || "") ? 0 : 1);
    const typed = products.some((product) => product.trackingType);
    const isTreatment = (product: Product) =>
      !/ktv|karaoke/i.test(product.categoryName || "") &&
      (typed
        ? product.trackingType === "SERVICE"
        : /spa|treat|massage/i.test(product.categoryName || ""));
    return products
      .filter(isTreatment)
      .sort(
        (left, right) =>
          spaFirst(left.categoryName) - spaFirst(right.categoryName) ||
          (left.categoryName || "").localeCompare(right.categoryName || "") ||
          left.name.localeCompare(right.name)
      )
      .flatMap((product) => {
        const variants = variantsByProductId[product.id] || [];
        return variants.map((variant) => ({
          value: variant.id,
          group: product.categoryName || t("spa.otherProducts"),
          price: Number(product.basePrice || 0) + Number(variant.priceModifier || 0),
          label: `${product.name}${
            variants.length > 1 && variant.variantSku ? ` · ${variant.variantSku}` : ""
          } — ${money(Number(product.basePrice || 0) + Number(variant.priceModifier || 0))}`,
          minutes: Number(/(\d+)\s*min/i.exec(product.name)?.[1] || 0),
        }));
      });
  }, [products, t, variantsByProductId]);
  const treatmentGroups = useMemo(
    () =>
      treatmentOptions.reduce<Record<string, typeof treatmentOptions>>((groups, option) => {
        (groups[option.group] ||= []).push(option);
        return groups;
      }, {}),
    [treatmentOptions]
  );
  const selectedTreatment = treatmentOptions.find(
    (option) => option.value === roomForm.rateVariantId
  );
  const roomSessionPrice = treatmentOptions.find(
    (option) => option.value === room?.rateVariantId
  )?.price;
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
      return { foundCard, foundWallet };
    },
    [getWallet, lookupCard, t]
  );

  useEffect(() => {
    void fetchBoard();
    void fetchProducts({ page: 1, limit: 100 });
    void fetchPaymentMethods();
  }, [fetchBoard, fetchPaymentMethods, fetchProducts]);

  useEffect(() => {
    const returned = location.state as { cardNumber?: string } | null;
    if (!returned?.cardNumber) return;
    const resume = readResume();
    void acceptCard(returned.cardNumber)
      .then(async () => {
        if (resume?.session) {
          setSelectedRoomId(resume.roomId || resume.session.roomId || "");
          setSession(resume.session);
          setPending(resume.pending || []);
          await loadBill(resume.session);
          setStep(resume.session.sessionState === "CLOSED" ? "pay" : "menu");
        }
        setNotice(t("spa.cardAccepted"));
      })
      .catch(() => setActionError(t("spa.errors.cardLookup")));
  }, [acceptCard, loadBill, location.state, t]);

  useEffect(() => {
    if (!session || billClosed || (step !== "menu" && step !== "pay")) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void getQuote(session.id);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [billClosed, getQuote, session, step]);

  const requestedVariants = useRef(new Set<string>());
  const needsTreatmentPrices = showRoomForm || step === "sessions";
  useEffect(() => {
    if (!needsTreatmentPrices) return;
    let cancelled = false;
    const missing = products.filter(
      (product) =>
        !variantsByProductId[product.id] && !requestedVariants.current.has(product.id)
    );
    void (async () => {
      for (const product of missing) {
        if (cancelled) return;
        requestedVariants.current.add(product.id);
        try {
          await fetchProductVariants(product.id);
        } catch {
          requestedVariants.current.delete(product.id);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchProductVariants, needsTreatmentPrices, products, variantsByProductId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchBoard();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [fetchBoard]);

  const refreshBill = async (target: SpaSession) => {
    if (target.salesOrderId) {
      await fetchOrderLines(target.salesOrderId, { page: 1, limit: 200 });
    }
    return getQuote(target.id);
  };

  const forgetCard = () => {
    setCard(null);
    setWallet(null);
  };

  const backToBoard = () => {
    setSession(null);
    clearQuote();
    setSelectedRoomId("");
    forgetCard();
    setPending([]);
    setPaid(null);
    setNotice(null);
    setActionError(null);
    setStep("rooms");
  };

  const openTopup = () => {
    if (!card || !wallet) return;
    writeResume(session ? { roomId: selectedRoomId, session, pending } : null);
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

  const selectSession = async (next: SpaSession) => {
    if (next.guestWalletId && wallet && next.guestWalletId !== wallet.id) {
      forgetCard();
    }
    setActionError(null);
    setSession(next);
    setPending([]);
    setPaid(null);
    setTip("");
    setCashAmount("");
    setSplitCash(false);
    await loadBill(next);
    setStep("menu");
  };

  const selectRoom = (next: SpaRoom) => {
    setSelectedRoomId(next.id);
    setSession(null);
    clearQuote();
    setGuestCount("1");
    setSessionCount(1);
    const running = next.sessions.filter(isOpenSpaSession);
    if (running.length === 1) {
      void selectSession(running[0]);
      return;
    }
    setStep("sessions");
  };

  const keyFor = (action: CardAction) => {
    if (!tapKeys.current[action]) {
      tapKeys.current[action] =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    return tapKeys.current[action]!;
  };

  const chargeFrom = async (action: CardAction, payerCard: GuestCard) => {
    if (!cardMethod || cardMethod.id === LOCAL_MEMBER_CARD_METHOD_ID) {
      throw new Error(t("spa.errors.paymentUnavailable"));
    }
    const context = await requireCashierContext();
    return {
      context,
      charge: {
        guestCardId: payerCard.id,
        paymentMethodId: cardMethod.id,
        posSessionId: context.posSessionId,
        idempotencyKey: keyFor(action),
      },
    };
  };

  const showCharged = (payer: GuestWallet, charged: string, balanceAfter: string) => {
    setWallet({ ...payer, balance: balanceAfter });
    setNotice(
      t("spa.charged", { amount: money(charged), balance: money(balanceAfter) })
    );
  };

  const openTreatment = async (payer: GuestWallet, payerCard: GuestCard) => {
    if (!room) return;
    setActionError(null);
    try {
      const { context, charge } = await chargeFrom("open", payerCard);
      const created = await openSession({
        roomId: room.id,
        guestWalletId: payer.id,
        guestCount: Math.max(1, Number(guestCount) || 1),
        sessions: sessionCount,
        prepay: charge,
        posRegisterId: context.posRegisterId,
        openedByPosSessionId: context.posSessionId,
        salesChannel: "POS",
      });
      tapKeys.current.open = undefined;
      await fetchBoard();
      await selectSession(created);
      setWallet(await getWallet(payer.id));
      setNotice(t("spa.treatmentStarted"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.openSession"));
    }
  };

  const extendTreatment = async (payer: GuestWallet, payerCard: GuestCard) => {
    if (!session) return;
    setActionError(null);
    setIsAdding(true);
    try {
      const { charge } = await chargeFrom("extend", payerCard);
      const result = await extendSession(session.id, { ...charge, sessions: extendCount });
      tapKeys.current.extend = undefined;
      setShowExtend(false);
      setSession({
        ...session,
        plannedMinutes:
          (session.plannedMinutes || 0) + extendCount * sessionMinutes(room),
      });
      showCharged(payer, result.charged, result.balanceAfter);
      await fetchBoard();
      await refreshBill(session);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.extend"));
    } finally {
      setIsAdding(false);
    }
  };

  const commitPending = async (payer: GuestWallet, payerCard: GuestCard, force = false) => {
    if (!session?.salesOrderId || billClosed || !pending.length) return;
    const prepaid = Boolean(quote?.prepaid);
    const estimate = estimateCardCharge({
      runningTotal: (prepaid ? 0 : Number(quote?.runningTotal || 0)) + pendingTotal(pending),
      discountBps: payer.discountBpsSnapshot,
    });
    if (!force && !cardCanCover(payer, estimate)) {
      setBalanceWarning(payer);
      return;
    }
    setBalanceWarning(null);
    setActionError(null);
    setIsAdding(true);
    if (prepaid) {
      try {
        const { charge } = await chargeFrom("add", payerCard);
        const result = await chargeItems(session.id, {
          ...charge,
          items: pending.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        });
        tapKeys.current.add = undefined;
        setPending([]);
        showCharged(payer, result.charged, result.balanceAfter);
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : t("spa.errors.editLine"));
      } finally {
        setIsAdding(false);
        await refreshBill(session);
      }
      return;
    }
    let remaining = pending;
    let added = 0;
    try {
      for (const item of pending) {
        await addOrderLine(session.salesOrderId, {
          variantId: item.variantId,
          quantity: item.quantity.toFixed(4),
          unitPrice: item.unitPrice.toFixed(4),
          lineDiscount: "0.0000",
        });
        remaining = remaining.filter((entry) => entry.variantId !== item.variantId);
        added += item.quantity;
      }
      setNotice(t("spa.itemsAdded", { count: added }));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.editLine"));
    } finally {
      setPending(remaining);
      setIsAdding(false);
      await refreshBill(session);
    }
  };

  const runCardAction = (action: CardAction, payer: GuestWallet, payerCard: GuestCard) => {
    if (action === "add") void commitPending(payer, payerCard);
    else if (action === "open") void openTreatment(payer, payerCard);
    else if (action === "extend") void extendTreatment(payer, payerCard);
    else setStep("pay");
  };

  const requestCard = (action: CardAction) => {
    setCardPromptError(null);
    setCardPrompt(action);
  };

  const handleCardRead = async (uid: string) => {
    if (!cardPrompt || isCheckingCard) return;
    setCardPromptError(null);
    setIsCheckingCard(true);
    try {
      const { foundCard, foundWallet } = await acceptCard(uid);
      if (
        cardPrompt !== "open" &&
        session?.guestWalletId &&
        session.guestWalletId !== foundWallet.id
      ) {
        forgetCard();
        setCardPromptError(t("spa.errors.wrongSessionCard"));
        return;
      }
      const action = cardPrompt;
      setCardPrompt(null);
      runCardAction(action, foundWallet, foundCard);
    } catch (caught) {
      forgetCard();
      setCardPromptError(
        caught instanceof Error ? caught.message : t("spa.errors.cardLookup")
      );
    } finally {
      setIsCheckingCard(false);
    }
  };

  const endTreatment = async () => {
    if (!session) return;
    if (pending.length) {
      setActionError(t("spa.errors.pendingItems"));
      return;
    }
    setActionError(null);
    setIsPaying(true);
    try {
      const final = await closeSession(session.id, {});
      writeResume(null);
      await fetchBoard();
      backToBoard();
      setNotice(
        t("spa.treatmentEnded", {
          room: final.roomNumber || room?.roomNumber || "",
          amount: money(final.paidTotal),
        })
      );
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.pay"));
    } finally {
      setIsPaying(false);
      setConfirmEnd(false);
    }
  };

  const handleOpenSession = (event: FormEvent) => {
    event.preventDefault();
    if (room) requestCard("open");
  };

  const handleAddProduct = async (product: Product, variantId: string, quantity: number) => {
    if (!session || billClosed) throw new Error(t("spa.errors.sessionRequired"));
    const variants = variantsByProductId[product.id]?.length
      ? variantsByProductId[product.id]
      : await fetchProductVariants(product.id);
    const variant = variants.find((item) => item.id === variantId) || variants[0];
    if (!variant) throw new Error(t("cashier.productMenu.noVariant"));
    setNotice(null);
    setPending((current) =>
      addPending(
        current,
        {
          variantId: variant.id,
          productId: product.id,
          name: product.name,
          unitPrice: Number(product.basePrice || 0) + Number(variant.priceModifier || 0),
        },
        Math.max(1, quantity)
      )
    );
  };

  const addAnother = (line: SalesOrderLine) => {
    const product = products.find((item) =>
      (variantsByProductId[item.id] || []).some((variant) => variant.id === line.variantId)
    );
    setPending((current) =>
      addPending(current, {
        variantId: line.variantId,
        productId: product?.id || line.variantId,
        name: line.productName || itemNames[line.variantId] || t("spa.item"),
        unitPrice: Number(line.unitPrice || 0),
      })
    );
  };

  const reduceLine = async (line: SalesOrderLine) => {
    if (!session?.salesOrderId || billClosed) return;
    const next = Number(line.quantity || 0) - 1;
    setActionError(null);
    try {
      if (next <= 0) await deleteOrderLine(session.salesOrderId, line.id);
      else await updateOrderLine(session.salesOrderId, line.id, { quantity: next.toFixed(4) });
      await refreshBill(session);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.editLine"));
    }
  };

  const removeLine = async (line: SalesOrderLine) => {
    if (!session?.salesOrderId || billClosed) return;
    setActionError(null);
    if (quote?.prepaid) {
      try {
        const result = await refundLine(session.id, line.id);
        await refreshBill(session);
        if (wallet) setWallet({ ...wallet, balance: result.balanceAfter });
        setNotice(
          t("spa.refunded", {
            amount: money(Math.abs(Number(result.charged))),
            balance: money(result.balanceAfter),
          })
        );
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : t("spa.errors.editLine"));
      }
      return;
    }
    try {
      await deleteOrderLine(session.salesOrderId, line.id);
      await refreshBill(session);
      setNotice(t("spa.lineRemoved"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.editLine"));
    }
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
      requestCard("pay");
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
          setActionError(t("spa.errors.balanceShort"));
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
      await fetchBoard();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("spa.errors.pay"));
    } finally {
      setIsPaying(false);
    }
  };

  const goToPay = () => {
    if (pending.length) {
      setActionError(t("spa.errors.pendingItems"));
      return;
    }
    requestCard("pay");
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
      await fetchBoard();
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
    else backToBoard();
  };

  const cardPromptTitle =
    cardPrompt === "add"
      ? t("spa.confirmAddTitle")
      : cardPrompt === "open"
        ? t("spa.confirmStartTitle", { room: room?.roomNumber || "" })
        : cardPrompt === "extend"
          ? t("spa.confirmExtendTitle", { count: extendCount })
          : t("spa.confirmPayTitle");

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#080808] p-4 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h1 className="text-xl font-bold">{t("spa.boardTitle")}</h1>
          <p className="text-sm text-slate-400">{t(`spa.steps.${step}`)}</p>
        </div>
        <div className="flex gap-2">
          {step !== "rooms" && !(step === "pay" && billClosed) && !paid ? (
            <Button variant="secondary" onClick={goBack}>
              {step === "pay" ? t("cardTopup.back") : t("spa.backToBoard")}
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-300">{t("spa.sessions")}</span>
                <div className="flex items-center rounded bg-slate-800">
                  <button
                    type="button"
                    aria-label={t("spa.fewerSessions")}
                    className="h-9 w-9 text-lg disabled:opacity-40"
                    disabled={sessionCount <= 1}
                    onClick={() => setSessionCount((count) => Math.max(1, count - 1))}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-semibold">{sessionCount}</span>
                  <button
                    type="button"
                    aria-label={t("spa.moreSessions")}
                    className="h-9 w-9 text-lg"
                    onClick={() => setSessionCount((count) => count + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="text-sm text-teal-300">
                {t("spa.sessionsSummary", {
                  minutes: sessionCount * sessionMinutes(room),
                  perSession: sessionMinutes(room),
                })}
                {roomSessionPrice
                  ? ` · ${money(roomSessionPrice * sessionCount)}`
                  : ""}
              </p>
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
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
          <SpaBillPanel
            room={room}
            session={liveSession || session}
            card={card}
            wallet={wallet}
            quote={quote}
            lines={orderLines}
            itemNames={itemNames}
            nowMs={nowMs}
            isBusy={isLoading || isPaying || isAdding}
            billClosed={billClosed}
            primaryLabel={
              quote?.prepaid
                ? t("spa.endTreatment")
                : step === "menu"
                  ? t("spa.goToPay")
                  : t("spa.addServices")
            }
            onPrimary={() =>
              quote?.prepaid
                ? pending.length
                  ? setActionError(t("spa.errors.pendingItems"))
                  : setConfirmEnd(true)
                : step === "menu"
                  ? goToPay()
                  : setStep("menu")
            }
            onExtend={() => {
              setExtendCount(1);
              setShowExtend(true);
            }}
            onTogglePause={() => void togglePause()}
            onChangeQuantity={(line) => void reduceLine(line)}
            onAddAnother={addAnother}
            onRemoveLine={(line) => void removeLine(line)}
            pending={pending}
            onPendingChange={(variantId, delta) =>
              setPending((current) => changePending(current, variantId, delta))
            }
            onClearPending={() => setPending([])}
            onCommitPending={() => requestCard("add")}
            onChangeCard={forgetCard}
          />

          {step === "menu" ? (
            <ProductMenu
              products={products}
              variantsByProductId={variantsByProductId}
              orderedProductQuantities={pendingByProduct}
              onLoadVariants={fetchProductVariants}
              onAdd={handleAddProduct}
              onClose={goToPay}
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
              <Button className="mt-4" onClick={backToBoard}>
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
                <Button variant="secondary" disabled={!wallet} onClick={openTopup}>
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

      {cardPrompt ? (
        <CardTapDialog
          title={cardPromptTitle}
          error={cardPromptError}
          isBusy={isCheckingCard}
          onCardRead={(uid) => void handleCardRead(uid)}
          onCancel={() => setCardPrompt(null)}
        >
          {cardPrompt === "add" ? (
            <>
              {pending.map((item) => (
                <p key={item.variantId} className="flex justify-between">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{money(item.unitPrice * item.quantity)}</span>
                </p>
              ))}
              <p className="mt-1 flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span>{t("spa.newItemsTotal")}</span>
                <span>{money(pendingTotal(pending))}</span>
              </p>
            </>
          ) : cardPrompt === "extend" ? (
            <p className="flex justify-between font-semibold">
              <span>
                {t("spa.sessionsSummary", {
                  minutes: extendCount * sessionMinutes(room),
                  perSession: sessionMinutes(room),
                })}
              </span>
              {roomSessionPrice ? <span>{money(roomSessionPrice * extendCount)}</span> : null}
            </p>
          ) : cardPrompt === "open" ? (
            <p>
              {t("spa.startSummary", {
                room: room?.roomNumber || "",
                sessions: sessionCount,
                minutes: sessionCount * sessionMinutes(room),
                count: Math.max(1, Number(guestCount) || 1),
              })}
            </p>
          ) : (
            <p className="flex justify-between font-semibold">
              <span>{t("spa.runningTotal")}</span>
              <span>{money(quote?.runningTotal)}</span>
            </p>
          )}
        </CardTapDialog>
      ) : null}

      {showExtend && session ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-teal-500 bg-slate-950 p-5">
            <h2 className="text-lg font-bold">{t("spa.extendTitle", { room: room?.roomNumber || "" })}</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">{t("spa.moreSessionsLabel")}</span>
              <div className="flex items-center rounded bg-slate-800">
                <button
                  type="button"
                  aria-label={t("spa.fewerSessions")}
                  className="h-9 w-9 text-lg disabled:opacity-40"
                  disabled={extendCount <= 1}
                  onClick={() => setExtendCount((count) => Math.max(1, count - 1))}
                >
                  −
                </button>
                <span className="w-8 text-center font-semibold">{extendCount}</span>
                <button
                  type="button"
                  aria-label={t("spa.moreSessions")}
                  className="h-9 w-9 text-lg"
                  onClick={() => setExtendCount((count) => count + 1)}
                >
                  +
                </button>
              </div>
            </div>
            <p className="text-sm text-teal-300">
              {t("spa.sessionsSummary", {
                minutes: extendCount * sessionMinutes(room),
                perSession: sessionMinutes(room),
              })}
              {roomSessionPrice ? ` · ${money(roomSessionPrice * extendCount)}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setShowExtend(false)}>
                {t("common.cancel")}
              </Button>
              <Button isLoading={isAdding} onClick={() => requestCard("extend")}>
                {t("spa.extendAndPay")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmEnd && session ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-600 bg-slate-950 p-5">
            <h2 className="text-lg font-bold">{t("spa.endTitle", { room: room?.roomNumber || "" })}</h2>
            <p className="text-sm text-slate-300">
              {t("spa.endDescription", { amount: money(quote?.paidTotal) })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
                {t("common.cancel")}
              </Button>
              <Button isLoading={isPaying} onClick={() => void endTreatment()}>
                {t("spa.endTreatment")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {balanceWarning ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-orange-400 bg-slate-950 p-5">
            <h2 className="text-lg font-bold text-orange-300">{t("spa.insufficientTitle")}</h2>
            <p className="text-sm text-slate-300">
              {t("spa.balanceVsTotal", {
                balance: money(balanceWarning.balance),
                total: money(
                  estimateCardCharge({
                    runningTotal: Number(quote?.runningTotal || 0) + pendingTotal(pending),
                    discountBps: balanceWarning.discountBpsSnapshot,
                  })
                ),
              })}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={() => setBalanceWarning(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={openTopup}>{t("spa.topUpCard")}</Button>
              {!quote?.prepaid && card ? (
                <Button
                  variant="secondary"
                  onClick={() => void commitPending(balanceWarning, card, true)}
                >
                  {t("spa.addAnyway")}
                </Button>
              ) : null}
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
            <label className="text-sm">
              {t("spa.treatment")}
              <select
                value={roomForm.rateVariantId}
                onChange={(event) => {
                  const option = treatmentOptions.find(
                    (item) => item.value === event.target.value
                  );
                  setRoomForm((current) => ({
                    ...current,
                    rateVariantId: event.target.value,
                    treatmentMinutes: option?.minutes
                      ? String(option.minutes)
                      : current.treatmentMinutes,
                  }));
                }}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                required
              >
                <option value="" disabled>
                  {t("spa.chooseTreatment")}
                </option>
                {roomForm.rateVariantId && !selectedTreatment ? (
                  <option value={roomForm.rateVariantId}>{t("spa.loadingTreatments")}</option>
                ) : null}
                {Object.entries(treatmentGroups).map(([group, options]) => (
                  <optgroup key={group} label={group}>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {(
              [
                ["treatmentMinutes", "spa.treatmentLengthLabel"],
                ["graceMinutes", "spa.graceMinutes"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {t(label)}
                <input
                  type="number"
                  min={key === "graceMinutes" ? 0 : 1}
                  value={roomForm[key]}
                  onChange={(event) =>
                    setRoomForm((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                  required
                />
              </label>
            ))}
            {selectedTreatment?.minutes &&
            selectedTreatment.minutes !== Number(roomForm.treatmentMinutes) ? (
              <p className="col-span-2 flex items-center justify-between gap-2 rounded border border-amber-500/60 bg-amber-950/40 p-2 text-xs text-amber-200">
                <span>
                  {t("spa.lengthMismatch", {
                    minutes: selectedTreatment.minutes,
                    length: roomForm.treatmentMinutes,
                  })}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setRoomForm((current) => ({
                      ...current,
                      treatmentMinutes: String(selectedTreatment.minutes),
                    }))
                  }
                >
                  {t("spa.useLength", { minutes: selectedTreatment.minutes })}
                </Button>
              </p>
            ) : null}
            <p className="col-span-2 text-xs text-slate-400">
              {selectedTreatment
                ? t("spa.rateSummary", {
                    treatment: selectedTreatment.label,
                    minutes: roomForm.treatmentMinutes,
                    grace: roomForm.graceMinutes,
                  })
                : t("spa.rateHint")}
            </p>
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
