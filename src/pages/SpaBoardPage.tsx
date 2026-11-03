import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useKdsDeleteSlipShopSetting } from "@/core/presentation/hooks/useKdsDeleteSlipShopSetting";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import { useDateFormatter } from "@/lib/i18n/formatters";
import { lineDisplayName } from "@/lib/pos/orderListDisplay";
import { isPendingKdsLine } from "@/lib/pos/kdsLines";
import { useLocation, useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { SettleSalesOrderResultDTO } from "@/core/application/dtos/SalesOrderDTO";
import type { SplitPaymentTenderDTO } from "@/core/application/dtos/CashierDTO";
import type { ChosenFee } from "@/core/domain/entities/ExtraFee";
import { useBillOptions } from "@/core/presentation/hooks/useBillOptions";
import { useExtraFees } from "@/core/presentation/hooks/useExtraFees";
import { billBreakdown } from "@/lib/pos/billBreakdown";
import { remainingReceivable } from "@/lib/pos/splitPayments";
import {
  findMemberCardPaymentMethod,
  LOCAL_MEMBER_CARD_METHOD_ID,
} from "@/core/application/services/PosPaymentCatalog";
import { ChosenModifier, PaymentMethod, Product, SalesOrderLine } from "@/core/domain/entities/Cashier";
import { ItemNoteDialog } from "@/components/notes/ItemNoteDialog";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { SpaRoom, SpaSession } from "@/core/domain/entities/Spa";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { useGuestWalletManagement } from "@/core/presentation/hooks/useGuestWalletManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { useSalesOrderManagement } from "@/core/presentation/hooks/useSalesOrderManagement";
import { RoomKind, useRoomPos } from "@/core/presentation/hooks/useRoomPos";
import { useRoomText } from "@/core/presentation/hooks/useRoomText";
import { useRoomFloor } from "@/core/presentation/hooks/useRoomFloor";
import { useRoomPromotions } from "@/core/presentation/hooks/useRoomPromotions";
import type { RunningPromotion } from "@/core/domain/entities/Promotion";
import { useSpaPackages } from "@/core/presentation/hooks/useSpaPackages";
import { useVenueSetting } from "@/core/presentation/hooks/useVenueSetting";
import {
  changeChoice,
  choiceTotals,
  chosenPackages,
  PackageChoice,
  packageOrders,
} from "@/lib/spa/packages";
import { getKtvWarning } from "@/lib/ktv/session";
import { isUnspendableWalletStatus } from "@/lib/pos/guestWalletAmounts";
import {
  buildSpaSettlePayments,
  cardCanCover,
  estimateCardCharge,
} from "@/lib/spa/payment";
import { lineFocDiscount, withOrderTipOnFirstPayment } from "@/lib/pos/checkoutAdjustments";
import { freeTimeFor } from "@/lib/spa/freeTime";
import type { RentalChoice } from "@/lib/spa/freeTime";
import {
  blockPrice,
  changeRentalPick,
  defaultRentalPicks,
  pickedRentals,
  RentalPicks,
  toggleRentalPick,
} from "@/lib/ktv/rentalPicks";
import { estimateRoomCharges } from "@/lib/spa/roomCharges";
import type { Hostess } from "@/core/domain/entities/Hostess";
import { usePlaceCharges } from "@/core/presentation/hooks/usePlaceCharges";
import { HostessPicker } from "./spa/HostessPicker";
import { HostessStrip } from "./ktv/HostessStrip";
import { useHostessBoard } from "@/core/presentation/hooks/useHostessBoard";
import { hostessStatusRows } from "@/lib/ktv/hostessStatus";
import { useWorkingHostesses } from "@/core/presentation/hooks/useWorkingHostesses";
import {
  addPending,
  changePending,
  focPending,
  paidPending,
  PendingItem,
  pendingKey,
  pendingOrderItems,
  setOrderedBy,
  setPendingNote,
  pendingSaving,
  pendingTotal,
  toggleOneFoc,
} from "@/lib/spa/pending";
import {
  findActiveSpaSession,
  isOpenSpaSession,
  spaSettleKey,
  sessionMinutes,
} from "@/lib/spa/session";
import { ProductMenu } from "./cashier/ProductMenu";
import { ExtraFeeDialog } from "./cashier/ExtraFeeDialog";
import { PaymentView } from "./cashier/PaymentView";
import { BillOptionsDialog } from "./cashier/BillOptionsDialog";
import { OrderAdjustments } from "./cashier/OrderAdjustments";
import { CardTapDialog } from "./spa/CardTapDialog";
import { SpaBillPanel } from "./spa/SpaBillPanel";
import { RoomFloorDialog, RoomFloorMode } from "./spa/RoomFloorDialog";
import { PackagePicker } from "./spa/PackagePicker";
import { SpaRoomTile } from "./spa/SpaRoomTile";
import { ManagerApprovalDialog } from "@/components/shift/ManagerApprovalDialog";
import { ManualTimesFields } from "./spa/ManualTimesFields";
import {
  defaultManualTimes,
  fromLocalInput,
  ManualTimes,
  manualTimesBackwards,
  roomTimeNamer,
  slipSessionCount,
  slipTimeRange,
} from "@/lib/spa/manualTimes";
import { BillLineGroup, isGivenFree, slipRows } from "@/lib/spa/billLines";
import { linePriceNote } from "@/lib/pos/linePrice";
import { modifierExtra } from "@/lib/modifiers/choices";
import { LineEditDialog, type LineEdit } from "./cashier/LineEditDialog";
import { modifierPrintText } from "@/lib/printing/modifierText";
import { receiptTotals } from "@/lib/printing/receiptTotals";
import { groupRoomTimeRows, mergedRoomTimeLine } from "@/lib/printing/roomTimeRows";
import { cashierLabel } from "@/lib/printing/cashier";

type SpaStep = "rooms" | "sessions" | "menu" | "pay";
type CardAction = "add" | "open" | "extend" | "pay";

type ResumeState = { roomId?: string; session?: SpaSession; pending?: PendingItem[] };

const resumeKey = (kind: RoomKind) => `${kind}-pos-resume`;

const readResume = (kind: RoomKind): ResumeState | null => {
  try {
    const raw = window.sessionStorage.getItem(resumeKey(kind));
    return raw ? (JSON.parse(raw) as ResumeState) : null;
  } catch {
    return null;
  }
};
const writeResume = (kind: RoomKind, value: ResumeState | null) => {
  try {
    if (value) window.sessionStorage.setItem(resumeKey(kind), JSON.stringify(value));
    else window.sessionStorage.removeItem(resumeKey(kind));
  } catch {
    // Storage can be blocked; the cashier then re-selects the room after a top-up.
  }
};

const emptyRoomForm = {
  roomNumber: "",
  name: "",
  capacity: "1",
  sessionPrice: "",
  treatmentMinutes: "60",
  graceMinutes: "15",
};

/** The products behind room time and SPA packages, which are not on the menu. */
/**
 * Product categories whose items are room time and packages rather than menu
 * items. These are the backend's category names, matched so they never show on
 * the menu: the KTV wording and the older "Private VIP Lounges" name both stay
 * listed so a renamed catalogue cannot leak room charges onto the menu.
 */
const ROOM_CATEGORIES = ["Spa Packages", "Spa Rooms", "KTV Rooms", "Private VIP Lounges"];

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function SpaBoardPage({ kind = "spa" }: { kind?: RoomKind }) {
  const { t } = useTranslation();
  const tr = useRoomText(kind);
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
    giveFree,
    refundLine,
    clearQuote,
  } = useRoomPos(kind);
  const {
    products,
    variantsByProductId,
    paymentMethods,
    discountReasons,
    fetchDiscountReasons,
    fetchProducts,
    fetchProductVariants,
    fetchPaymentMethods,
    listKdsTickets,
    addExtraFeeLine,
    splitOrderLine,
  } = useCashier();
  const {
    orderLines,
    fetchOrderLines,
    addOrderLine,
    updateOrderLine,
    deleteOrderLine,
    settleOrder,
    fetchOrderBill,
  } = useSalesOrderManagement();
  const { lookupCard, getWallet } = useGuestWalletManagement();
  const { user } = useAuth();
  const { formatDateTime } = useDateFormatter();
  const { activeLocationId, activePosRegisterId, requireCashierContext, isWorkspaceReady } =
    usePosWorkspace();
  const printer = usePrinterConnection(
    String(user?.tenantId || ""),
    activePosRegisterId,
    activeLocationId
  );
  const { listStations } = useKdsStationManagement();
  const kdsDeleteSlip = useKdsDeleteSlipShopSetting();

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
  const [manualTimes, setManualTimes] = useState<ManualTimes>({ inAt: "", outAt: "" });
  // Bill & table for a room: the same bill-level choices the cashier takes.
  const [billDiscount, setBillDiscount] = useState("0.0000");
  const [billDiscountReasonId, setBillDiscountReasonId] = useState("");
  const [billOptionsOpen, setBillOptionsOpen] = useState(false);
  const [splitCash, setSplitCash] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const { fees: extraFees, isFeeLine } = useExtraFees();
  const [extraFeeOpen, setExtraFeeOpen] = useState(false);
  const { moveRoom, mergeRoom, splitRoom } = useRoomFloor(kind);
  const [floorMode, setFloorMode] = useState<RoomFloorMode | null>(null);
  const [isMovingRoom, setIsMovingRoom] = useState(false);
  const [isAddingFee, setIsAddingFee] = useState(false);
  const [payMethodId, setPayMethodId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitTenders, setSplitTenders] = useState<SplitPaymentTenderDTO[]>([]);
  const [paid, setPaid] = useState<SettleSalesOrderResultDTO | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [extendCount, setExtendCount] = useState(1);
  const [packageChoice, setPackageChoice] = useState<PackageChoice>({});
  const [extendChoice, setExtendChoice] = useState<PackageChoice>({});
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Charged items waiting for a manager before their money goes back to the card.
  const [refundApproval, setRefundApproval] = useState<SalesOrderLine[] | null>(null);
  // A bill row being changed in Edit item: its price, FOC or who ordered it.
  const [editingRow, setEditingRow] = useState<BillLineGroup | null>(null);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const tapKeys = useRef<Partial<Record<CardAction, string>>>({});
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<SpaRoom | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [showFoc, setShowFoc] = useState(false);
  const [focReason, setFocReason] = useState("");
  const [isGivingFoc, setIsGivingFoc] = useState(false);
  const [rentalVariantId, setRentalVariantId] = useState("");
  // KTV: a party can buy more than one rate (2 h hourly + one 30 min block), so each
  // rate keeps its own count instead of one count shared by the picked rate.
  const [startPicks, setStartPicks] = useState<RentalPicks>({});
  const [extendPicks, setExtendPicks] = useState<RentalPicks>({});
  /** The room whose default rate was put on the new-party form, so a refresh keeps it. */
  const startPicksRoom = useRef("");
  const [pickedCharges, setPickedCharges] = useState<string[]>([]);
  const [hostessFor, setHostessFor] = useState<{
    product: Product;
    variantId: string;
    unitPrice: number;
    quantity: number;
    modifiers?: ChosenModifier[];
    note?: string;
  } | null>(null);
  // The pending row whose note for the kitchen is being written.
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const room = rooms.find((item) => item.id === selectedRoomId) || null;
  const isSpa = kind === "spa";
  const { packages: spaPackages, error: packagesError } = useSpaPackages(isSpa);
  const venue = useVenueSetting();
  // A new room follows Venue setup; a running one keeps how it started.
  const startsAtEnd = venue.paymentTiming === "PAY_AT_END";
  const atEnd = quote?.paymentTiming === "PAY_AT_END";
  // Venue setup can turn food and drinks off for SPA or KTV; the server refuses them then.
  const menuAllowed = isSpa ? venue.spaMenuOrdering : venue.ktvMenuOrdering;
  const openSessions = useMemo(
    () => (room?.sessions || []).filter(isOpenSpaSession),
    [room?.sessions]
  );
  const billClosed = session?.sessionState === "CLOSED";
  const payingStarts = confirmEnd || step === "pay";
  const sessionId = session?.id;
  const sessionOpenedAt = session?.openedAt;
  const sessionPlanned = session?.plannedMinutes;
  // The guest's In and Out start from the room's own times each time paying begins.
  useEffect(() => {
    if (!payingStarts || billClosed || !sessionId || !sessionOpenedAt) return;
    setManualTimes(
      defaultManualTimes({ openedAt: sessionOpenedAt, plannedMinutes: sessionPlanned })
    );
  }, [billClosed, payingStarts, sessionId, sessionOpenedAt, sessionPlanned]);
  const manualClose = () => ({
    manualInAt: fromLocalInput(manualTimes.inAt),
    manualOutAt: fromLocalInput(manualTimes.outAt),
  });
  const slipNamer = (lines: SalesOrderLine[]) => {
    const inAt = fromLocalInput(manualTimes.inAt);
    const outAt = fromLocalInput(manualTimes.outAt);
    return roomTimeNamer(
      lines,
      slipTimeRange(inAt, outAt),
      // A KTV room is sold by the hour, so the slip says how many it was.
      isSpa ? undefined : slipSessionCount(inAt, outAt)
    );
  };
  const timesBackwards = !billClosed && manualTimesBackwards(manualTimes);
  const manualTimesFields =
    session && !billClosed ? (
      <ManualTimesFields
        value={manualTimes}
        onChange={setManualTimes}
        sessionTime={`${formatDateTime(session.openedAt)} → ${formatDateTime(
          new Date(nowMs).toISOString()
        )}`}
        tr={tr}
      />
    ) : null;
  const liveSession = room?.sessions.find((item) => item.id === session?.id);
  const cardMethod = findMemberCardPaymentMethod(paymentMethods);
  const cashMethod = paymentMethods.find(
    (method) => String(method.kind || "").toUpperCase() === "CASH"
  );
  // Customer credit needs a named customer, which a room bill does not take here.
  const otherMethods = paymentMethods.filter(
    (method) =>
      method.id !== cardMethod?.id &&
      method.id !== LOCAL_MEMBER_CARD_METHOD_ID &&
      !["GUEST_CARD", "CUSTOMER_CREDIT"].includes(String(method.kind || "").toUpperCase())
  );
  const [otherMethodId, setOtherMethodId] = useState("");
  const tipValue = Math.max(0, Number(tip) || 0);
  // A tip on a room paid as it goes: from its card, or by cash and the like.
  const tipMethods = [
    ...(card && cardMethod && cardMethod.id !== LOCAL_MEMBER_CARD_METHOD_ID ? [cardMethod] : []),
    ...otherMethods,
  ];
  const [tipMethodId, setTipMethodId] = useState("");
  const tipMethod = tipMethods.find((method) => method.id === tipMethodId) || tipMethods[0];
  const tipReceiptRow = tipValue > 0 ? [{ label: tr("tip"), amount: tipValue.toFixed(4) }] : [];
  const cashValue = splitCash ? Math.max(0, Number(cashAmount) || 0) : 0;
  const estimatedCard = estimateCardCharge({
    // A bill paid at the end comes due with its tax and service charge.
    runningTotal: Number(quote?.amountDue) > 0 ? quote!.amountDue! : quote?.runningTotal || 0,
    discountBps: wallet?.discountBpsSnapshot,
    tip: tipValue,
    cash: cashValue,
  });
  // A bill paid at the end is paid like a cashier bill: the server prices it,
  // with or without tax and service charge, and it may be split across methods.
  const endBillOrderId = atEnd && !quote?.prepaid ? session?.salesOrderId : undefined;
  const chargedLines = orderLines.filter(
    (line) => !["VOIDED", "COMPED"].includes(String(line.status || "").toUpperCase())
  );
  const menuItemOf = useMemo(() => {
    const items: Record<string, { product: Product; priceModifier?: string }> = {};
    for (const product of products) {
      for (const variant of variantsByProductId[product.id] || []) {
        items[variant.id] = { product, priceModifier: variant.priceModifier };
      }
    }
    return items;
  }, [products, variantsByProductId]);
  /**
   * What the menu charges for one of a line, so a price changed on this bill shows
   * as one. Room time has none: its rate changes with the hour.
   */
  const menuPriceFor = (line: SalesOrderLine) => {
    if (isFeeLine(line) || line.variantId === room?.rateVariantId) return undefined;
    const booked = spaPackages.find((item) => item.variantId === line.variantId);
    if (booked) return booked.price;
    const item = menuItemOf[line.variantId];
    if (item?.product.kind === "RENTAL") return undefined;
    const listPrice = item
      ? Number(item.product.basePrice || 0) + Number(item.priceModifier || 0)
      : line.menuPrice !== undefined
        ? Number(line.menuPrice)
        : undefined;
    return listPrice === undefined ? undefined : listPrice + modifierExtra(line.selectedModifiers);
  };
  const billOptions = useBillOptions({
    billKey: endBillOrderId || "none",
    orderId: endBillOrderId,
    discount: billDiscount,
    revision: JSON.stringify([
      chargedLines.map((line) => [line.id, line.quantity, line.unitPrice, line.lineDiscount]),
      billClosed,
    ]),
    fetchBill: fetchOrderBill,
  });
  const serverBill = billOptions.bill ?? billOptions.quote;
  /**
   * The bill as the till has it now: a room's time lands on it when the room
   * closes, so a slip reads the settled bill rather than the one on screen.
   */
  const readBill = async (orderId: string) => {
    try {
      return await fetchOrderBill(orderId, billOptions.query);
    } catch {
      return serverBill;
    }
  };
  // Clock time not yet written to a line; the room's close writes it.
  const timeNotOnLines = billClosed
    ? 0
    : Math.max(
        0,
        Number(quote?.runningTotal || 0) -
          chargedLines.reduce(
            (sum, line) =>
              sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) - Number(line.lineDiscount || 0),
            0
          )
      );
  const endBillDue = serverBill
    ? Number(serverBill.grandTotal) + timeNotOnLines
    : Number(quote?.amountDue || quote?.runningTotal || 0);
  const endBillTotal = endBillDue + tipValue;
  const endBreakdown = endBillOrderId
    ? billBreakdown({
        lines: chargedLines,
        menuPrice: menuPriceFor,
        itemsTotal: serverBill ? Number(serverBill.subtotal) + timeNotOnLines : endBillDue,
        // The server's total discount holds the items' own (FOC, item discounts) too.
        billDiscount: Number(billDiscount) || 0,
        serviceCharge: serverBill ? Number(serverBill.serviceCharge) : 0,
        tax: serverBill ? Number(serverBill.addedTax) + Number(serverBill.serviceChargeTax) : 0,
        includedTax: serverBill
          ? Number(serverBill.totalTax) - Number(serverBill.addedTax) - Number(serverBill.serviceChargeTax)
          : 0,
        tip: tipValue,
        total: endBillTotal,
      })
    : undefined;
  const endPayMethods = [
    ...(cardMethod && cardMethod.id !== LOCAL_MEMBER_CARD_METHOD_ID ? [cardMethod] : []),
    ...otherMethods,
  ];
  const endPayMethodId =
    endPayMethods.find((method) => method.id === payMethodId)?.id ||
    (card && cardMethod ? cardMethod.id : endPayMethods.find((method) => method.id !== cardMethod?.id)?.id) ||
    "";
  const isCardMethod = (methodId: string) => Boolean(cardMethod && methodId === cardMethod.id);

  const itemNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const product of products) {
      for (const variant of variantsByProductId[product.id] || []) {
        names[variant.id] = product.name;
      }
    }
    if (room) names[room.rateVariantId] = tr("treatmentCharge");
    for (const item of spaPackages) names[item.variantId] = item.name;
    return names;
  }, [products, room, spaPackages, tr, variantsByProductId]);
  const pendingByProduct = useMemo(
    () =>
      pending.reduce<Record<string, number>>((counts, item) => {
        counts[item.productId] = (counts[item.productId] || 0) + item.quantity;
        return counts;
      }, {}),
    [pending]
  );
  const packageVariantIds = useMemo(
    () => new Set(spaPackages.map((item) => item.variantId)),
    [spaPackages]
  );
  // KTV: the hostesses with this room may order dishes and drinks for it.
  const { hostesses: workingHostesses, load: loadHostesses } = useWorkingHostesses();
  useEffect(() => {
    if (!isSpa && session?.id) void loadHostesses();
  }, [isSpa, session?.id, loadHostesses]);
  const serviceVariantIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => product.askWhoServed)
          .flatMap((product) => (variantsByProductId[product.id] || []).map((variant) => variant.id))
      ),
    [products, variantsByProductId]
  );
  const hostessName = (id: string) => {
    const hostess = workingHostesses.find((item) => item.id === id);
    return hostess ? hostess.nickname || hostess.name : undefined;
  };
  const roomHostessIds = new Set([
    ...orderLines
      .filter((line) => line.hostessId && serviceVariantIds.has(line.variantId))
      .map((line) => line.hostessId!),
    ...pending.filter((item) => item.service && item.hostessId).map((item) => item.hostessId!),
    ...workingHostesses
      .filter((hostess) => room && hostess.inRoom?.roomNumber === room.roomNumber)
      .map((hostess) => hostess.id),
  ]);
  const orderers = isSpa
    ? []
    : [...roomHostessIds].flatMap((id) => {
        const name = hostessName(id);
        return name ? [{ id, name }] : [];
      });
  const isHostessService = (line: SalesOrderLine) =>
    Boolean(line.askWhoServed) || serviceVariantIds.has(line.variantId);
  const orderedByName = (line: SalesOrderLine) =>
    line.hostessId && !isHostessService(line)
      ? hostessName(line.hostessId) || tr("aHostess")
      : undefined;
  /**
   * The hostess a printed line names: who gave a hostess service, on every slip;
   * who ordered a dish or drink, except on the check slip.
   */
  const slipHostess = (line: SalesOrderLine, withOrderedBy: boolean) => {
    if (!line.hostessId) return undefined;
    if (isHostessService(line)) return hostessName(line.hostessId) || tr("aHostess");
    return withOrderedBy ? orderedByName(line) : undefined;
  };
  /** A printed line's options, then the name of its hostess. */
  const printedExtras = (line: SalesOrderLine, withOrderedBy = true) => {
    const modifiers = modifierPrintText(line.selectedModifiers);
    const who = slipHostess(line, withOrderedBy);
    if (!who) return modifiers;
    return {
      names: [modifiers.names, who].filter(Boolean).join(", "),
      prices: [modifiers.prices, "-"].filter(Boolean).join(", "),
    };
  };
  /**
   * The bill's rows as the slip prints them: one row per item, as the bill shows it.
   * The check slip the guests read before paying leaves out which lady ordered what.
   */
  const receiptLines = (printedLines: SalesOrderLine[], withOrderedBy = true) => {
    const name = slipNamer(printedLines);
    // A room sold at more than one rate is one row on the paper, priced per rate.
    const isRoomRate = (line: SalesOrderLine) =>
      line.variantId === room?.rateVariantId || rentalVariantIds.has(line.variantId);
    return groupRoomTimeRows(slipRows(printedLines), isRoomRate).map((group) => {
      const { line } = group.rows[0];
      const printed = name(
        line,
        lineDisplayName(line) || line.productName || itemNames[line.variantId] || tr("item")
      );
      if (group.rows.length > 1) return mergedRoomTimeLine(group, printed);
      const modifiers = printedExtras(line, withOrderedBy);
      const note = isGivenFree(line) || line.appliedPromotionId
        ? undefined
        : linePriceNote(line.unitPrice, menuPriceFor(line));
      return {
        name: note ? t(`cashier.orderPanel.priceNote.${note}`, { name: printed }) : printed,
        quantity: String(group.rows[0].quantity || line.quantity || "1"),
        unitPrice: line.unitPrice?.trim() || undefined,
        modifiers: modifiers.names,
        modifierPrices: modifiers.prices,
        ...(line.note ? { remarks: line.note } : {}),
      };
    });
  };
  // Before the room starts, the packages it starts with; once it runs, the ones added.
  const booking = session ? extendChoice : packageChoice;
  // KTV: the rentals this room can be sold under; the room's own rate unless another is picked.
  const placeCharges = usePlaceCharges(room ? room.id : null);
  const rentals = useMemo(() => (isSpa ? [] : placeCharges), [isSpa, placeCharges]);
  const rental =
    rentals.find((item) => item.variantId === rentalVariantId) ||
    rentals.find((item) => item.variantId === room?.rateVariantId) ||
    rentals[0] ||
    null;
  // The room's own rate is quoted at the price now (peak hours included).
  const roomSessionPrice =
    rental && rental.variantId !== room?.rateVariantId ? rental.unitPrice : room?.sessionPrice;
  const unitMinutes = !isSpa && rental ? rental.blockMinutes : sessionMinutes(room);
  const minimumUnits = !isSpa && rental ? rental.minimumUnits : 1;
  // A running room is extended on the rental last sold on its bill, as the server does.
  const billRental =
    [...orderLines]
      .reverse()
      .map((line) => rentals.find((item) => item.variantId === line.variantId))
      .find(Boolean) ||
    rentals.find((item) => item.variantId === room?.rateVariantId) ||
    rentals[0];
  /**
   * KTV rooms that sell more than one rate (an hour and a half hour, say) let the
   * party buy several at once, so 2 h 30 min is two hourly blocks plus one 30 min
   * block. Rooms with a single rate keep the one count they always had.
   */
  const multiRate = !isSpa && rentals.length > 1;
  const rentalPrice = (item: RentalChoice) =>
    blockPrice(item, room?.rateVariantId, room?.sessionPrice);
  const rentalPicksPicker = (
    picks: RentalPicks,
    onChange: (variantId: string, delta: number) => void,
    onToggle: (variantId: string) => void
  ) =>
    multiRate ? (
      <div className="space-y-1">
        <span className="text-sm text-slate-300">{tr("chooseRental")}</span>
        {rentals.map((item) => {
          const units = Math.max(0, Math.floor(picks[item.variantId] || 0));
          return (
            <div
              key={item.variantId}
              className={`flex items-center gap-2 rounded border p-2 text-sm ${
                units ? "border-emerald-500 bg-emerald-950/40" : "border-slate-700 bg-slate-950"
              }`}
            >
              <button
                type="button"
                aria-pressed={units > 0}
                onClick={() => onToggle(item.variantId)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block font-semibold">{item.name}</span>
                <span className="block text-xs text-slate-400">
                  {tr("rentalPrice", {
                    price: money(rentalPrice(item)),
                    minutes: item.blockMinutes,
                  })}
                </span>
              </button>
              <div className="flex items-center rounded bg-slate-800">
                <button
                  type="button"
                  aria-label={tr("fewerRental", { name: item.name })}
                  className="h-9 w-9 text-lg disabled:opacity-40"
                  disabled={!units}
                  onClick={() => onChange(item.variantId, -1)}
                >
                  −
                </button>
                <span className="w-8 text-center font-semibold">{units}</span>
                <button
                  type="button"
                  aria-label={tr("moreRental", { name: item.name })}
                  className="h-9 w-9 text-lg"
                  onClick={() => onChange(item.variantId, 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ) : null;
  /** One rate of the booking: what it costs, how long it runs. */
  type RatePlan = {
    variantId?: string;
    units: number;
    blockMinutes: number;
    unitPrice: number;
    amount: number;
  };
  const planFor = (blocks: ReturnType<typeof pickedRentals>, count: number): RatePlan[] =>
    multiRate
      ? blocks.map((block) => ({
          variantId: block.rental.variantId,
          units: block.units,
          blockMinutes: block.rental.blockMinutes,
          unitPrice: blockPrice(block.rental, room?.rateVariantId, room?.sessionPrice),
          amount: block.amount,
        }))
      : [
          {
            variantId: rental?.variantId,
            units: count,
            blockMinutes: unitMinutes,
            unitPrice: roomSessionPrice || 0,
            amount: (roomSessionPrice || 0) * count,
          },
        ];
  const startBlocks = pickedRentals(
    rentals,
    startPicks,
    room?.rateVariantId,
    room?.sessionPrice
  );
  const extendBlocks = pickedRentals(
    rentals,
    extendPicks,
    room?.rateVariantId,
    room?.sessionPrice
  );
  const startPlan = planFor(startBlocks, sessionCount);
  const extendPlan = planFor(extendBlocks, extendCount);
  // Packages a running "buy X, get Y free" adds on top, with their time.
  const freePackagesFor = (running: RunningPromotion[]) =>
    chosenPackages(booking, spaPackages).flatMap(({ package: item, quantity }) => {
      const free = freeTimeFor(item.variantId, quantity, running, "SPA_PACKAGE");
      return free ? [{ package: item, free }] : [];
    });
  // SPA: the room's own charges, e.g. a VIP room fee or a sauna by the hour.
  const roomChargesFor = (running: RunningPromotion[]) =>
    isSpa
      ? estimateRoomCharges(
          placeCharges,
          pickedCharges,
          {
            minutes:
              choiceTotals(packageChoice, spaPackages).minutes +
              (session
                ? 0
                : freePackagesFor(running).reduce(
                    (sum, { package: item, free }) => sum + item.durationMinutes * free.units,
                    0
                  )),
            billAtEnd: startsAtEnd,
          },
          (charge, units) => freeTimeFor(charge.variantId, units, running, "ROOM_TIME", "WITHIN")
        )
      : null;
  const promotions = useRoomPromotions(
    kind,
    activeLocationId || undefined,
    (running) => [
      ...paidPending(pending).map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      ...chosenPackages(booking, spaPackages).map(({ package: item, quantity }) => ({
        variantId: item.variantId,
        quantity,
      })),
      ...(session ? extendPlan : startPlan)
        .filter((entry) => entry.variantId && entry.unitPrice > 0)
        .map((entry) => ({
          variantId: entry.variantId!,
          quantity: entry.units,
          unitPrice: entry.unitPrice,
        })),
      ...(session
        ? []
        : (roomChargesFor(running)?.now ?? [])
            .filter((line) => line.units - (line.free?.units || 0) > 0)
            .map((line) => ({
              variantId: line.charge.variantId,
              quantity: line.units - (line.free?.units || 0),
              unitPrice: line.charge.unitPrice,
            }))),
    ],
    session?.salesOrderId || undefined
  );
  const saving = (variantId: string | undefined) =>
    (variantId && promotions.discounts[variantId]?.discount) || 0;
  const bookingTotals = choiceTotals(booking, spaPackages);
  const freePackages = freePackagesFor(promotions.running);
  const bookingDue =
    bookingTotals.price -
    chosenPackages(booking, spaPackages).reduce((sum, { package: item }) => sum + saving(item.variantId), 0);
  const pendingDue = pendingTotal(pending) - pendingSaving(pending, promotions.discounts);
  const roomCharges = roomChargesFor(promotions.running);
  const roomChargesSaving = (roomCharges?.now ?? []).reduce(
    (sum, line) => sum + saving(line.charge.variantId),
    0
  );
  const roomChargesDue = (roomCharges?.total || 0) - roomChargesSaving;
  const optionalCharges = isSpa ? placeCharges.filter((charge) => !charge.autoApply) : [];
  // While a treatment runs, the room's charges that can be added later: not clocks,
  // which start with the treatment.
  const laterCharges = optionalCharges.filter(
    (charge) => !(charge.soldBy === "TIME" && charge.chargeMode === "CLOCK")
  );
  const roomChargeChips =
    isSpa && session && !billClosed && laterCharges.length ? (
      <div className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-950 p-2 text-sm">
        <span className="font-semibold text-slate-300">{tr("roomCharges")}</span>
        {laterCharges.map((charge) => (
          <button
            key={charge.variantId}
            type="button"
            onClick={() =>
              setPending((current) =>
                addPending(
                  current,
                  {
                    variantId: charge.variantId,
                    productId: charge.productId,
                    name: charge.name,
                    unitPrice: charge.unitPrice,
                  },
                  charge.soldBy === "TIME" ? charge.minimumUnits : 1
                )
              )
            }
            className="rounded border border-slate-600 px-2 py-1 hover:border-emerald-500"
          >
            + {charge.name} · {money(charge.unitPrice)}
            {charge.soldBy === "TIME" ? ` / ${tr("roomChargeBlock", { minutes: charge.blockMinutes })}` : ""}
          </button>
        ))}
      </div>
    ) : null;
  /** The free time each bought rate earns, so several rates each show their own deal. */
  const freeFor = (plan: RatePlan[]) =>
    plan.flatMap((entry) => {
      const free = entry.variantId
        ? freeTimeFor(entry.variantId, entry.units, promotions.running)
        : null;
      return free ? [{ ...free, minutes: free.units * entry.blockMinutes }] : [];
    });
  const startFree = isSpa ? [] : freeFor(startPlan);
  const extendFree = isSpa ? [] : freeFor(extendPlan);
  const freeMinutes = (offers: { minutes: number }[]) =>
    offers.reduce((sum, offer) => sum + offer.minutes, 0);
  const planSaving = (plan: RatePlan[]) =>
    plan.reduce((sum, entry) => sum + saving(entry.variantId), 0);
  const planMinutes = (plan: RatePlan[]) =>
    plan.reduce((sum, entry) => sum + entry.units * entry.blockMinutes, 0);
  const planAmount = (plan: RatePlan[]) => plan.reduce((sum, entry) => sum + entry.amount, 0);
  // Bought time, and bought plus any free time a running deal adds.
  const startBoughtMinutes = planMinutes(startPlan);
  const extendBoughtMinutes = planMinutes(extendPlan);
  const startMinutes = startBoughtMinutes + freeMinutes(startFree);
  const extendMinutes = extendBoughtMinutes + freeMinutes(extendFree);
  const startSaving = planSaving(startPlan);
  const extendSaving = planSaving(extendPlan);
  const startPriced = multiRate ? startPlan.length > 0 : roomSessionPrice !== undefined;
  const extendPriced = multiRate ? extendPlan.length > 0 : roomSessionPrice !== undefined;
  const startCharge = planAmount(startPlan) - (session ? 0 : startSaving);
  const extendCharge = planAmount(extendPlan) - (session ? extendSaving : 0);
  const freeTimeNotes = (offers: ReturnType<typeof freeFor>, className: string) =>
    offers.map((free, index) => (
      <p key={`${free.name}-${index}`} className={className}>
        {tr("freeTimeAdded", { count: free.units, name: free.name })}
      </p>
    ));
  const rateProductIds = useMemo(
    () => new Set(rooms.map((item) => item.rateProductId).filter(Boolean)),
    [rooms]
  );
  /** KTV: every rate this room sells, so the bill reads them all as room time. */
  const rentalVariantIds = useMemo(
    () => new Set(rentals.map((item) => item.variantId)),
    [rentals]
  );
  // Room time and packages are booked with the room, never ordered from the menu. A
  // product sold only at other areas stays off, and only KTV can pick a hostess.
  const area = isSpa ? "SPA" : "KTV";
  const menuProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.kind !== "RENTAL" &&
          !rateProductIds.has(product.id) &&
          !ROOM_CATEGORIES.includes(product.categoryName || "") &&
          (!product.soldAt?.length || product.soldAt.includes(area)) &&
          (!isSpa || !product.askWhoServed)
      ),
    [area, isSpa, products, rateProductIds]
  );
  const freePackageNotes = freePackages.length ? (
    <div className="space-y-1">
      {freePackages.map(({ package: item, free }) => (
        <p
          key={item.id}
          className="rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-sm text-emerald-200"
        >
          {tr("freePackageAdded", { count: free.units, package: item.name, name: free.name })}
        </p>
      ))}
    </div>
  ) : null;
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
        throw new Error(tr("errors.walletUnavailable"));
      }
      setCard(foundCard);
      setWallet(foundWallet);
      return { foundCard, foundWallet };
    },
    [getWallet, lookupCard, tr]
  );

  useEffect(() => {
    if (!notice) return;
    toast.success(notice);
    setNotice(null);
  }, [notice]);

  useEffect(() => {
    if (!actionError) return;
    toast.error(actionError);
    setActionError(null);
  }, [actionError]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (packagesError) toast.error(tr("errors.packages", { message: packagesError }));
  }, [packagesError, tr]);

  useEffect(() => {
    void fetchBoard();
    void fetchProducts({ page: 1, limit: 100 });
    void fetchPaymentMethods();
  }, [fetchBoard, fetchPaymentMethods, fetchProducts]);

  useEffect(() => {
    const returned = location.state as { cardNumber?: string } | null;
    if (!returned?.cardNumber) return;
    const resume = readResume(kind);
    void acceptCard(returned.cardNumber)
      .then(async () => {
        if (resume?.session) {
          setSelectedRoomId(resume.roomId || resume.session.roomId || "");
          setSession(resume.session);
          setPending(resume.pending || []);
          await loadBill(resume.session);
          setStep(resume.session.sessionState === "CLOSED" ? "pay" : "menu");
        }
        setNotice(tr("cardAccepted"));
      })
      .catch(() => setActionError(tr("errors.cardLookup")));
  }, [acceptCard, kind, loadBill, location.state, tr]);

  useEffect(() => {
    if (!session || billClosed || (step !== "menu" && step !== "pay")) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void getQuote(session.id);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [billClosed, getQuote, session, step]);

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
    writeResume(kind, session ? { roomId: selectedRoomId, session, pending } : null);
    navigate("/cards", {
      state: {
        cardNumber: card.cardUid,
        balance: wallet.balance,
        customerName: wallet.guestName,
        customerPhone: wallet.guestPhone,
        tenantId: wallet.tenantId,
        walletId: wallet.id,
        returnTo: kind === "ktv" ? "/ktv" : "/spa",
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
    setTipMethodId("");
    setCashAmount("");
    setSplitCash(false);
    await loadBill(next);
    setStep("menu");
  };

  // KTV: who is working, which room each is in and how long she has left.
  const hostessBoard = useHostessBoard(!isSpa && step === "rooms");
  const hostessRows = hostessStatusRows(hostessBoard.hostesses, nowMs);
  const hostessesIn = (target: SpaRoom) =>
    hostessRows
      .filter((row) => row.roomId === target.id || (!row.roomId && row.roomNumber === target.roomNumber))
      .map((row) => row.name);

  const selectRoom = (next: SpaRoom) => {
    setSelectedRoomId(next.id);
    setRentalVariantId("");
    setPickedCharges([]);
    setStartPicks({});
    setExtendPicks({});
    startPicksRoom.current = "";
    setSession(null);
    clearQuote();
    setGuestCount("1");
    setSessionCount(1);
    setPackageChoice({});
    const running = next.sessions.filter(isOpenSpaSession);
    if (running.length === 1) {
      void selectSession(running[0]);
      return;
    }
    setStep("sessions");
  };

  // A new party starts on the room's own rate, at its minimum; the cashier adds the
  // other rates (a half hour on top of two hours) on the same form.
  useEffect(() => {
    if (isSpa || !room || rentals.length < 2 || startPicksRoom.current === room.id) return;
    startPicksRoom.current = room.id;
    const own = defaultRentalPicks(rentals, room.rateVariantId);
    if (Object.keys(own).length) setStartPicks(own);
  }, [isSpa, rentals, room]);

  const keyFor = (action: CardAction) => {
    if (!tapKeys.current[action]) {
      tapKeys.current[action] =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    return tapKeys.current[action]!;
  };

  const chargeFrom = async (action: CardAction, payerCard: GuestCard | null, method?: PaymentMethod) => {
    if (method) {
      const context = await requireCashierContext();
      return {
        context,
        charge: {
          paymentMethodId: method.id,
          posSessionId: context.posSessionId,
          idempotencyKey: keyFor(action),
        },
      };
    }
    if (!payerCard || !cardMethod || cardMethod.id === LOCAL_MEMBER_CARD_METHOD_ID) {
      throw new Error(tr("errors.paymentUnavailable"));
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

  const showCharged = (
    payer: GuestWallet | null,
    charged: string,
    balanceAfter: string,
    method?: PaymentMethod
  ) => {
    if (!payer) {
      setNotice(tr("paidWith", { amount: money(charged), method: method?.name || "" }));
      return;
    }
    setWallet({ ...payer, balance: balanceAfter });
    setNotice(
      tr("charged", { amount: money(charged), balance: money(balanceAfter) })
    );
  };

  /** The kitchen tickets an order has so far, or null when they cannot be read. */
  const kitchenTicketIds = async (salesOrderId?: string | null) => {
    if (!salesOrderId) return new Set<string>();
    try {
      const { tickets } = await listKdsTickets({ salesOrderId, limit: 100 });
      return new Set(tickets.map((ticket) => ticket.id));
    } catch {
      return null;
    }
  };

  /** Prints the kitchen tickets an order got since `before`. */
  const printNewTickets = async (
    salesOrderId: string | null | undefined,
    before: Set<string> | null
  ) => {
    if (!salesOrderId || !before) return;
    try {
      const { tickets } = await listKdsTickets({ salesOrderId, limit: 100 });
      for (const ticket of tickets.filter((item) => !before.has(item.id))) {
        await printer.printTicket(ticket);
      }
    } catch (caught) {
      setActionError(
        t("kds.printFailed", {
          error: caught instanceof Error ? caught.message : t("roomOrders.printFailed"),
        })
      );
    }
  };

  /**
   * Tells the kitchen to stop making lines the room no longer has: a DELETE slip
   * on each line's station printer, when the shop prints them. Nothing prints for
   * a line the kitchen never got, and a print problem never undoes the removal.
   * Returns what the shop should be told, or null when all printed.
   */
  const printKdsDelete = async (removed: SalesOrderLine[]) => {
    if (!kdsDeleteSlip.enabled) return null;
    const printed = removed.filter((line) => !isPendingKdsLine(line));
    if (!printed.length) return null;
    const title = t("cashier.orderPanel.kdsDeleteTitle");
    try {
      const listed = activeLocationId
        ? await listStations({ page: 1, limit: 100, locationId: activeLocationId })
        : { stations: [] };
      // With no station there is no printer to tell, so the removal stays quiet.
      if (!listed.stations.length) return null;
      const plan = await printer.printKitchen(
        {
          title,
          firedAt: new Date().toISOString(),
          orderRef: quote?.orderNumber || undefined,
          place: `${kind === "ktv" ? "KTV" : "SPA"} ${room?.roomNumber || ""}`.trim(),
          sentBy: cashierLabel(user),
          lines: printed.map((line) => {
            const modifiers = modifierPrintText(line.selectedModifiers);
            return {
              name: lineDisplayName(line) || line.productName || tr("item"),
              quantity: String(line.quantity || "1"),
              categoryId: line.categoryId,
              modifiers: modifiers.names,
              modifierPrices: modifiers.prices,
              // The line prints the same name, marked as gone.
              remarks: title,
            };
          }),
        },
        listed.stations.map((station) => ({
          id: station.id,
          name: station.name,
          printerIds: station.printerIds,
          categoryIds: station.routingRules.categoryIds,
        })),
        { requireStationRouting: true }
      );
      const problems: string[] = [];
      if (plan.unrouted.length) {
        problems.push(
          t("cashier.errors.kdsUnrouted", {
            items: plan.unrouted.map((line) => line.name).join(", "),
          })
        );
      }
      if (plan.missingPrinterRoutes.length) {
        problems.push(
          t("cashier.errors.kdsPrinterUnavailable", {
            stations: plan.missingPrinterRoutes
              .map((route) => route.stationName)
              .join(", "),
          })
        );
      }
      return problems.length ? problems.join(" ") : null;
    } catch (error) {
      return error instanceof Error ? error.message : t("cashier.errors.kdsFailed");
    }
  };

  /**
   * The rest of a multi-rate booking. The room opens (or is extended) on its first
   * rate; the other rates the party bought go on as more time, charged the same way
   * and on their own idempotency keys so no charge is swallowed as a repeat.
   */
  const addOtherRates = async (
    sessionId: string,
    plan: RatePlan[],
    charge?: {
      guestCardId?: string;
      paymentMethodId?: string;
      posSessionId?: string;
      idempotencyKey?: string;
    }
  ): Promise<{ charged: number; balanceAfter: string } | null> => {
    let charged = 0;
    let balanceAfter = "";
    for (const [index, entry] of plan.slice(1).entries()) {
      if (!entry.variantId) continue;
      const result = await extendSession(sessionId, {
        ...(charge
          ? { ...charge, idempotencyKey: `${charge.idempotencyKey}-${index + 2}` }
          : {}),
        sessions: entry.units,
        rentalVariantId: entry.variantId,
      });
      charged += Number(result.charged || 0);
      balanceAfter = result.balanceAfter || balanceAfter;
    }
    return charged || balanceAfter ? { charged, balanceAfter } : null;
  };

  const openTreatment = async (
    payer: GuestWallet | null,
    payerCard: GuestCard | null,
    method?: PaymentMethod
  ) => {
    if (!room || !startPlan.length) return;
    setActionError(null);
    try {
      const { context, charge } = await chargeFrom("open", payerCard, method);
      const first = startPlan[0];
      const created = await openSession({
        roomId: room.id,
        ...(payer ? { guestWalletId: payer.id } : {}),
        guestCount: Math.max(1, Number(guestCount) || 1),
        ...(isSpa
          ? {
              packages: packageOrders(packageChoice, spaPackages),
              roomCharges: pickedCharges.map((variantId) => ({ variantId })),
            }
          : { sessions: first.units, rentalVariantId: first.variantId }),
        prepay: charge,
        posRegisterId: context.posRegisterId,
        openedByPosSessionId: context.posSessionId,
        salesChannel: "POS",
      });
      await addOtherRates(created.id, startPlan, charge);
      tapKeys.current.open = undefined;
      void printNewTickets(created.salesOrderId, new Set());
      await fetchBoard();
      await selectSession(created);
      if (payer) setWallet(await getWallet(payer.id));
      setNotice(tr("treatmentStarted"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.openSession"));
    }
  };

  /** Pay at the end: the room starts with what was booked on its bill, no card tap. */
  const openOnBill = async () => {
    if (!room || !startPlan.length) return;
    setActionError(null);
    try {
      const context = await requireCashierContext();
      const first = startPlan[0];
      const created = await openSession({
        roomId: room.id,
        ...(wallet ? { guestWalletId: wallet.id } : {}),
        guestCount: Math.max(1, Number(guestCount) || 1),
        ...(isSpa
          ? {
              packages: packageOrders(packageChoice, spaPackages),
              roomCharges: pickedCharges.map((variantId) => ({ variantId })),
            }
          : { sessions: first.units, rentalVariantId: first.variantId }),
        posRegisterId: context.posRegisterId,
        openedByPosSessionId: context.posSessionId,
        salesChannel: "POS",
      });
      await addOtherRates(created.id, startPlan);
      void printNewTickets(created.salesOrderId, new Set());
      await fetchBoard();
      await selectSession(created);
      setNotice(tr("startedOnBill"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.openSession"));
    }
  };

  /** Pay at the end: more time goes on the bill, no card tap. */
  const extendOnBill = async () => {
    if (!session || !extendPlan.length) return;
    setActionError(null);
    setIsAdding(true);
    try {
      const before = await kitchenTicketIds(session.salesOrderId);
      const first = extendPlan[0];
      await extendSession(
        session.id,
        isSpa
          ? { packages: packageOrders(extendChoice, spaPackages), idempotencyKey: keyFor("extend") }
          : {
              sessions: first.units,
              rentalVariantId: first.variantId,
              idempotencyKey: keyFor("extend"),
            }
      );
      if (!isSpa) await addOtherRates(session.id, extendPlan);
      tapKeys.current.extend = undefined;
      void printNewTickets(session.salesOrderId, before);
      setShowExtend(false);
      setSession({
        ...session,
        plannedMinutes:
          (session.plannedMinutes || 0) +
          (isSpa ? choiceTotals(extendChoice, spaPackages).minutes : extendMinutes),
      });
      setExtendChoice({});
      setNotice(tr("addedToBillNotice"));
      await fetchBoard();
      await refreshBill(session);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.extend"));
    } finally {
      setIsAdding(false);
    }
  };

  /** Pay at the end: new items go on the bill and to the kitchen, no card tap. */
  const commitOnBill = async () => {
    const toAdd = paidPending(pending);
    if (!session || billClosed || !toAdd.length) return;
    setActionError(null);
    setIsAdding(true);
    try {
      const before = await kitchenTicketIds(session.salesOrderId);
      await chargeItems(session.id, {
        items: pendingOrderItems(toAdd),
        idempotencyKey: keyFor("add"),
      });
      tapKeys.current.add = undefined;
      void printNewTickets(session.salesOrderId, before);
      setPending(focPending);
      setNotice(tr("itemsAdded", { count: toAdd.reduce((sum, item) => sum + item.quantity, 0) }));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
    } finally {
      setIsAdding(false);
      await refreshBill(session);
    }
  };

  /** Adds the tray: a card tap when paying as it goes, straight onto the bill otherwise. */
  const addPaidItems = () => {
    if (atEnd) void commitOnBill();
    else requestCard("add");
  };

  const extendTreatment = async (
    payer: GuestWallet | null,
    payerCard: GuestCard | null,
    method?: PaymentMethod
  ) => {
    if (!session || !extendPlan.length) return;
    setActionError(null);
    setIsAdding(true);
    try {
      const { charge } = await chargeFrom("extend", payerCard, method);
      const before = await kitchenTicketIds(session.salesOrderId);
      const first = extendPlan[0];
      const result = await extendSession(
        session.id,
        isSpa
          ? { ...charge, packages: packageOrders(extendChoice, spaPackages) }
          : { ...charge, sessions: first.units, rentalVariantId: first.variantId }
      );
      const extra = isSpa ? null : await addOtherRates(session.id, extendPlan, charge);
      tapKeys.current.extend = undefined;
      void printNewTickets(session.salesOrderId, before);
      setShowExtend(false);
      setSession({
        ...session,
        plannedMinutes:
          (session.plannedMinutes || 0) +
          (isSpa ? choiceTotals(extendChoice, spaPackages).minutes : extendMinutes),
      });
      setExtendChoice({});
      showCharged(
        payer,
        String(Number(result.charged || 0) + Number(extra?.charged || 0)),
        extra?.balanceAfter || result.balanceAfter,
        method
      );
      await fetchBoard();
      await refreshBill(session);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.extend"));
    } finally {
      setIsAdding(false);
    }
  };

  const commitPending = async (
    payer: GuestWallet | null,
    payerCard: GuestCard | null,
    force = false,
    method?: PaymentMethod
  ) => {
    const toPay = paidPending(pending);
    if (!session?.salesOrderId || billClosed || !toPay.length) return;
    const prepaid = Boolean(quote?.prepaid);
    const estimate = estimateCardCharge({
      runningTotal: (prepaid ? 0 : Number(quote?.runningTotal || 0)) + pendingDue,
      discountBps: payer?.discountBpsSnapshot,
    });
    if (payer && !force && !cardCanCover(payer, estimate)) {
      setBalanceWarning(payer);
      return;
    }
    setBalanceWarning(null);
    setActionError(null);
    setIsAdding(true);
    if (prepaid) {
      try {
        const { charge } = await chargeFrom("add", payerCard, method);
        const before = await kitchenTicketIds(session.salesOrderId);
        const result = await chargeItems(session.id, {
          ...charge,
          items: pendingOrderItems(toPay),
        });
        tapKeys.current.add = undefined;
        void printNewTickets(session.salesOrderId, before);
        setPending(focPending);
        showCharged(payer, result.charged, result.balanceAfter, method);
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
      } finally {
        setIsAdding(false);
        await refreshBill(session);
      }
      return;
    }
    let remaining = pending;
    let added = 0;
    try {
      for (const item of toPay) {
        await addOrderLine(session.salesOrderId, {
          variantId: item.variantId,
          quantity: item.quantity.toFixed(4),
          unitPrice: item.unitPrice.toFixed(4),
          lineDiscount: "0.0000",
          ...(item.modifiers?.length ? { selectedModifiers: item.modifiers } : {}),
          ...(item.hostessId ? { hostessId: item.hostessId } : {}),
          ...(item.note ? { note: item.note } : {}),
        });
        remaining = remaining.filter((entry) => entry !== item);
        added += item.quantity;
      }
      setNotice(tr("itemsAdded", { count: added }));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
    } finally {
      setPending(remaining);
      setIsAdding(false);
      await refreshBill(session);
    }
  };

  const addPendingToBill = () => {
    setActionError(null);
    if (focPending(pending).length) {
      setShowFoc(true);
      void fetchDiscountReasons().catch(() => undefined);
      return;
    }
    addPaidItems();
  };

  const confirmFoc = async () => {
    const free = focPending(pending);
    if (!session || !free.length || !focReason.trim()) return;
    setActionError(null);
    setIsGivingFoc(true);
    try {
      const before = await kitchenTicketIds(session.salesOrderId);
      await giveFree(session.id, {
        items: pendingOrderItems(free),
        reason: focReason.trim(),
      });
      void printNewTickets(session.salesOrderId, before);
      const count = free.reduce((sum, item) => sum + item.quantity, 0);
      const rest = paidPending(pending);
      setPending(rest);
      setShowFoc(false);
      setNotice(tr("focGiven", { count }));
      await refreshBill(session);
      if (rest.length) addPaidItems();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.foc"));
    } finally {
      setIsGivingFoc(false);
    }
  };

  const runCardAction = (action: CardAction, payer: GuestWallet, payerCard: GuestCard) => {
    if (action === "add") void commitPending(payer, payerCard);
    else if (action === "open") void openTreatment(payer, payerCard);
    else if (action === "extend") void extendTreatment(payer, payerCard);
    else {
      if (cardMethod) setPayMethodId(cardMethod.id);
      setStep("pay");
    }
  };

  /** Pays the prompt's order another way than the card: cash, a transfer, and so on. */
  const payWith = (methodId: string) => {
    const method = otherMethods.find((item) => item.id === methodId);
    const action = cardPrompt;
    if (!method || !action) return;
    setCardPrompt(null);
    if (action === "add") void commitPending(null, null, false, method);
    else if (action === "open") void openTreatment(null, null, method);
    else if (action === "extend") void extendTreatment(null, null, method);
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
        setCardPromptError(tr("errors.wrongSessionCard"));
        return;
      }
      const action = cardPrompt;
      setCardPrompt(null);
      runCardAction(action, foundWallet, foundCard);
    } catch (caught) {
      forgetCard();
      setCardPromptError(
        caught instanceof Error ? caught.message : tr("errors.cardLookup")
      );
    } finally {
      setIsCheckingCard(false);
    }
  };

  const endTreatment = async () => {
    if (!session) return;
    if (timesBackwards) {
      setActionError(tr("errors.manualTimes"));
      return;
    }
    if (pending.length) {
      setActionError(tr("errors.pendingItems"));
      return;
    }
    if (tipValue > 0 && !tipMethod) {
      setActionError(tr("errors.tipMethod"));
      return;
    }
    setActionError(null);
    setIsPaying(true);
    try {
      const tipPayment =
        tipValue > 0 && tipMethod
          ? {
              amount: tipValue.toFixed(4),
              paymentMethodId: tipMethod.id,
              ...(tipMethod.id === cardMethod?.id && card ? { guestCardId: card.id } : {}),
              posSessionId: (await requireCashierContext()).posSessionId,
              idempotencyKey: `${kind}-tip-${session.id}`,
            }
          : undefined;
      const final = await closeSession(session.id, {
        ...(tipPayment ? { tip: tipPayment } : {}),
        ...manualClose(),
      });
      writeResume(kind, null);
      await fetchBoard();
      try {
        const printedLines = orderLines.filter((line) => !line.voidedAt);
        // The bill as the till has it now (the room's time lands on it at close),
        // so the slip's money rows add up to the total it prints.
        const bill = session.salesOrderId ? await readBill(session.salesOrderId) : serverBill;
        const totals = receiptTotals(bill, printedLines);
        await printer.printReceipt({
          title: "RECEIPT",
          sale: true,
          place: "CHECKOUT",
          showLogo: true,
          showPrices: true,
          receiptId: final.orderNumber || quote?.orderNumber || undefined,
          cashier: cashierLabel(final.cashier, user),
          serviceType: kind === "ktv" ? "KTV" : "SPA",
          tableOrRoom: final.roomNumber || room?.roomNumber,
          paidAt: new Date().toLocaleString(),
          startTime: formatDateTime(session.openedAt),
          endTime: formatDateTime(final.asOf || new Date().toISOString()),
          startTimeLabel: t("receipt.startTime"),
          endTimeLabel: t("receipt.endTime"),
          lines: receiptLines(printedLines),
          ...totals,
          amounts: tipReceiptRow,
          total: String(final.paidTotal || final.runningTotal || "0"),
        });
      } catch (printError) {
        toast.error(
          printError instanceof Error ? printError.message : t("receipt.printFailed")
        );
      }
      backToBoard();
      setNotice(
        tr("treatmentEnded", {
          room: final.roomNumber || room?.roomNumber || "",
          amount: money(final.paidTotal),
        })
      );
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.pay"));
    } finally {
      setIsPaying(false);
      setConfirmEnd(false);
    }
  };

  const handleOpenSession = (event: FormEvent) => {
    event.preventDefault();
    if (!room) return;
    if (isSpa && !choiceTotals(packageChoice, spaPackages).count) return;
    if (startsAtEnd) void openOnBill();
    else requestCard("open");
  };

  const handleAddProduct = async (
    product: Product,
    variantId: string,
    quantity: number,
    modifiers?: ChosenModifier[],
    note?: string
  ) => {
    if (!session || billClosed) throw new Error(tr("errors.sessionRequired"));
    const variants = variantsByProductId[product.id]?.length
      ? variantsByProductId[product.id]
      : await fetchProductVariants(product.id);
    const variant = variants.find((item) => item.id === variantId) || variants[0];
    if (!variant) throw new Error(t("cashier.productMenu.noVariant"));
    setNotice(null);
    const unitPrice =
      Number(product.basePrice || 0) + Number(variant.priceModifier || 0) + modifierExtra(modifiers);
    const extras = {
      ...(modifiers?.length ? { modifiers } : {}),
      ...(note ? { note } : {}),
    };
    if (!isSpa && product.askWhoServed) {
      setHostessFor({
        product,
        variantId: variant.id,
        unitPrice,
        quantity: Math.max(1, quantity),
        ...extras,
      });
      return;
    }
    setPending((current) =>
      addPending(
        current,
        { variantId: variant.id, productId: product.id, name: product.name, unitPrice, ...extras },
        Math.max(1, quantity)
      )
    );
  };

  const pickHostess = (hostess: Hostess) => {
    if (!hostessFor) return;
    const { product, variantId, unitPrice, quantity, modifiers, note } = hostessFor;
    const who = hostess.nickname || hostess.name;
    setPending((current) =>
      addPending(
        current,
        {
          variantId,
          productId: product.id,
          name: `${product.name} · ${who}`,
          unitPrice,
          hostessId: hostess.id,
          hostessName: who,
          service: true,
          ...(modifiers?.length ? { modifiers } : {}),
          ...(note ? { note } : {}),
        },
        quantity
      )
    );
    setHostessFor(null);
  };

  const addAnother = (line: SalesOrderLine) => {
    const product = products.find((item) =>
      (variantsByProductId[item.id] || []).some((variant) => variant.id === line.variantId)
    );
    if (!isSpa && product?.askWhoServed) {
      setHostessFor({
        product,
        variantId: line.variantId,
        unitPrice: Number(line.unitPrice || 0),
        quantity: 1,
      });
      return;
    }
    setPending((current) =>
      addPending(current, {
        variantId: line.variantId,
        productId: product?.id || line.variantId,
        name: line.productName || itemNames[line.variantId] || tr("item"),
        unitPrice: Number(line.unitPrice || 0),
      })
    );
  };

  const sourceLinesOf = (line: SalesOrderLine) =>
    (line as SalesOrderLine & { groupedLines?: SalesOrderLine[] }).groupedLines || [line];

  const reduceLine = async (line: SalesOrderLine) => {
    if (!session?.salesOrderId || billClosed) return;
    const sources = sourceLinesOf(line);
    const target = [...sources].reverse().find((item) => Number(item.quantity || 0) > 0);
    if (!target) return;
    const next = Number(target.quantity || 0) - 1;
    setActionError(null);
    try {
      if (next <= 0) {
        await deleteOrderLine(session.salesOrderId, target.id);
        const problem = await printKdsDelete([target]);
        if (problem) setActionError(problem);
      } else {
        await updateOrderLine(session.salesOrderId, target.id, { quantity: next.toFixed(4) });
      }
      await refreshBill(session);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
    }
  };

  const removeLine = async (line: SalesOrderLine, approverToken?: string) => {
    if (!session?.salesOrderId || billClosed) return;
    const sources = sourceLinesOf(line);
    setActionError(null);
    if (quote?.prepaid && line.compReasonId) {
      try {
        for (const source of sources) await refundLine(session.id, source.id);
        await refreshBill(session);
        setNotice(tr("lineRemoved"));
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
      }
      return;
    }
    if (quote?.prepaid) {
      try {
        let refunded = 0;
        let balanceAfter = wallet?.balance || "0";
        for (const source of sources) {
          const result = await refundLine(session.id, source.id, undefined, approverToken);
          refunded += Math.abs(Number(result.charged));
          balanceAfter = result.balanceAfter;
        }
        await refreshBill(session);
        if (wallet) setWallet({ ...wallet, balance: balanceAfter });
        setNotice(
          tr("refunded", {
            amount: money(refunded),
            balance: money(balanceAfter),
          })
        );
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
      }
      return;
    }
    try {
      for (const source of sources) await deleteOrderLine(session.salesOrderId, source.id);
      await refreshBill(session);
      setNotice(tr("lineRemoved"));
      const problem = await printKdsDelete(sources);
      if (problem) setActionError(problem);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
    }
  };

  const removeLines = async (group: SalesOrderLine[], approverToken?: string) => {
    // Money going back to the card waits for a manager, once for the whole row.
    if (!approverToken && quote?.prepaid && group.some((line) => !line.compReasonId)) {
      setRefundApproval(group);
      return;
    }
    for (const line of [...group].reverse()) await removeLine(line, approverToken);
  };

  /**
   * Saves the cashier's Edit item on a row: the newest lines take the change
   * first, and one only partly covered is split so the rest keeps its price.
   */
  const editRow = async (group: BillLineGroup, edit: LineEdit) => {
    const orderId = session?.salesOrderId;
    if (!session || !orderId || billClosed) return;
    const fee = isFeeLine(group.lines[0]);
    const unitPrice = (entry: SalesOrderLine) =>
      fee ? entry.unitPrice || "0.0000" : edit.unitPrice.toFixed(4);
    const hostessOf = (entry: SalesOrderLine) =>
      edit.orderedBy === undefined ? entry.hostessId : edit.orderedBy || undefined;
    const noteOf = (entry: SalesOrderLine) =>
      edit.note === undefined ? entry.note : edit.note || undefined;
    const unchanged = (entry: SalesOrderLine) =>
      Number(unitPrice(entry)) === Number(entry.unitPrice || 0) &&
      edit.foc === isGivenFree(entry) &&
      (hostessOf(entry) || null) === (entry.hostessId || null) &&
      (noteOf(entry) || null) === (entry.note || null);
    let left = edit.quantity;
    const plan: Array<{ entry: SalesOrderLine; take: number }> = [];
    for (const entry of [...group.lines].reverse()) {
      if (left <= 0) break;
      const take = Math.min(left, Number(entry.quantity || 0));
      if (take > 0) plan.push({ entry, take });
      left -= take;
    }
    setActionError(null);
    setIsSavingLine(true);
    try {
      for (const { entry, take } of plan) {
        if (unchanged(entry)) continue;
        const quantity = take.toFixed(4);
        const target =
          take < Number(entry.quantity || 0) - 0.00005
            ? await splitOrderLine(orderId, entry.id, quantity)
            : entry;
        const price = unitPrice(target);
        await updateOrderLine(orderId, target.id, {
          quantity,
          unitPrice: price,
          lineDiscount: edit.foc
            ? lineFocDiscount({ quantity, unitPrice: price })
            : isGivenFree(entry)
              ? "0.0000"
              : target.lineDiscount || "0.0000",
          ...(edit.orderedBy !== undefined ? { hostessId: edit.orderedBy } : {}),
          ...(edit.note !== undefined ? { note: edit.note } : {}),
        });
      }
      setEditingRow(null);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.editLine"));
    } finally {
      setIsSavingLine(false);
      await refreshBill(session);
    }
  };

  const changeRooms = async (
    change: () => Promise<{ roomId: string }>,
    done: (roomNumber: string) => string
  ) => {
    if (!session) return;
    setIsMovingRoom(true);
    try {
      const result = await change();
      const board = await fetchBoard();
      const nextRoom = board.find((item) => item.id === result.roomId);
      setSelectedRoomId(result.roomId);
      setSession({ ...session, roomId: result.roomId });
      await refreshBill(session);
      setFloorMode(null);
      setNotice(done(nextRoom?.roomNumber || ""));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("floor.failed"));
    } finally {
      setIsMovingRoom(false);
    }
  };

  const roomNumberOf = (roomId: string) =>
    rooms.find((item) => item.id === roomId)?.roomNumber || "";

  const togglePause = async () => {
    if (!session || billClosed) return;
    const updated =
      session.sessionState === "PAUSED"
        ? await resumeSession(session.id)
        : await pauseSession(session.id);
    setSession({ ...session, ...updated, salesOrderId: session.salesOrderId });
    await getQuote(session.id);
  };

  /**
   * The guest's bill before it is paid: what it owes right now, not how it was
   * settled. Printed when the customer asks to check the bill.
   */
  const printCheckBill = async () => {
    if (!session) return;
    try {
      const printedLines = orderLines.filter((line) => !line.voidedAt);
      const bill = session.salesOrderId ? await readBill(session.salesOrderId) : serverBill;
      const totals = receiptTotals(bill, printedLines);
      // Clock time the close has not written to the bill yet is still owed, so the
      // check bill counts it in the items and in the receivable.
      const items = bill ? Number(totals.subtotal || 0) + timeNotOnLines : undefined;
      const due = bill
        ? Number(bill.grandTotal) + timeNotOnLines
        : Number(quote?.amountDue || quote?.runningTotal || 0);
      await printer.printReceipt({
        title: tr("checkBill"),
        place: "CHECKOUT",
        showLogo: true,
        showPrices: true,
        receiptId: quote?.orderNumber || undefined,
        cashier: cashierLabel(user),
        serviceType: kind === "ktv" ? "KTV" : "SPA",
        tableOrRoom: room?.roomNumber || quote?.roomNumber,
        startTime: formatDateTime(session.openedAt),
        endTime: formatDateTime(new Date().toISOString()),
        startTimeLabel: t("receipt.startTime"),
        endTimeLabel: t("receipt.endTime"),
        lines: receiptLines(printedLines, false),
        ...(items !== undefined ? { subtotal: items.toFixed(4) } : {}),
        ...(totals.discount ? { discount: totals.discount } : {}),
        ...(totals.tax ? { tax: totals.tax } : {}),
        ...(totals.serviceCharge ? { serviceCharge: totals.serviceCharge } : {}),
        totalLabel: tr("receivable"),
        total: due.toFixed(4),
      });
    } catch (printError) {
      toast.error(printError instanceof Error ? printError.message : t("receipt.printFailed"));
    }
  };

  /**
   * One row per method the guest paid with, so a bill split between a wallet and
   * cash reads "KBZ pay 100,000" then "Cash 20,000" instead of one joined line.
   */
  const printPaid = async (
    result: SettleSalesOrderResultDTO,
    endAt: string,
    payments: Array<{ name: string; amount: string }>
  ) => {
    if (!session) return;
    try {
      const printedLines = orderLines.filter((line) => !line.voidedAt);
      // The bill as it stands after the settle, as the cashier prints it.
      const bill = session.salesOrderId ? await readBill(session.salesOrderId) : serverBill;
      const totals = receiptTotals(bill, printedLines);
      await printer.printReceipt({
        title: "RECEIPT",
        sale: true,
        place: "CHECKOUT",
        showLogo: true,
        showPrices: true,
        receiptId: result.orderNumber || quote?.orderNumber || undefined,
        cashier: cashierLabel(user),
        serviceType: kind === "ktv" ? "KTV" : "SPA",
        tableOrRoom: room?.roomNumber || quote?.roomNumber,
        paidAt: new Date().toLocaleString(),
        startTime: formatDateTime(session.openedAt),
        endTime: formatDateTime(endAt),
        startTimeLabel: t("receipt.startTime"),
        endTimeLabel: t("receipt.endTime"),
        lines: receiptLines(printedLines),
        ...totals,
        amounts: tipReceiptRow,
        total: result.grandTotal,
        payments,
        ...(Number(result.change) > 0 ? { change: result.change } : {}),
      });
    } catch (printError) {
      toast.error(
        printError instanceof Error ? printError.message : t("receipt.printFailed")
      );
    }
  };

  /** Pay at the end with cash or another method: close the room, then settle the bill. */
  const handlePayOther = async () => {
    const method = otherMethods.find((item) => item.id === otherMethodId);
    if (!session?.salesOrderId || !method) return;
    if (timesBackwards) {
      setActionError(tr("errors.manualTimes"));
      return;
    }
    setActionError(null);
    setIsPaying(true);
    try {
      const context = await requireCashierContext();
      let endAt = session.closedAt || session.endsAt || "";
      let due = Number(quote?.amountDue || 0);
      if (!billClosed) {
        const closed = await closeSession(session.id, manualClose());
        endAt = closed.asOf || new Date().toISOString();
        due = Number(closed.amountDue ?? closed.runningTotal ?? 0);
        setSession({ ...session, sessionState: "CLOSED" });
      }
      const result =
        due > 0
          ? await settleOrder(session.salesOrderId, {
              payments: withOrderTipOnFirstPayment(
                [{ paymentMethodId: method.id, amount: (due + tipValue).toFixed(4) }],
                tipValue
              ),
              posSessionId: context.posSessionId,
              ...(tipValue > 0 ? { tipAmount: tipValue.toFixed(4) } : {}),
              idempotencyKey: spaSettleKey(session.id),
            })
          : {
              orderId: session.salesOrderId,
              orderNumber: "",
              grandTotal: "0.0000",
              totalPaid: "0.0000",
              change: "0.0000",
              status: "COMPLETED",
            };
      await printPaid(result, endAt, [
        { name: method.name || "Payment", amount: result.totalPaid || result.grandTotal },
      ]);
      setPaid(result);
      writeResume(kind, null);
      await fetchBoard();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.pay"));
    } finally {
      setIsPaying(false);
    }
  };

  const handlePay = async () => {
    if (timesBackwards) {
      setActionError(tr("errors.manualTimes"));
      return;
    }
    if (!session?.salesOrderId || !card || !wallet) {
      requestCard("pay");
      return;
    }
    if (!cardMethod || cardMethod.id === LOCAL_MEMBER_CARD_METHOD_ID) {
      setActionError(tr("errors.paymentUnavailable"));
      return;
    }
    if (cashValue > 0 && !cashMethod) {
      setActionError(tr("errors.cashUnavailable"));
      return;
    }
    setActionError(null);
    setIsPaying(true);
    try {
      const context = await requireCashierContext();
      let endAt = session.closedAt || session.endsAt || "";
      if (!billClosed) {
        const latest = await getQuote(session.id);
        const estimate = estimateCardCharge({
          runningTotal: Number(latest.amountDue) > 0 ? latest.amountDue! : latest.runningTotal,
          discountBps: wallet.discountBpsSnapshot,
          tip: tipValue,
          cash: cashValue,
        });
        if (!cardCanCover(wallet, estimate)) {
          setActionError(tr("errors.balanceShort"));
          return;
        }
        const closed = await closeSession(session.id, manualClose());
        endAt = closed.asOf || new Date().toISOString();
        setSession({ ...session, sessionState: "CLOSED" });
      }
      const result = await settleOrder(session.salesOrderId, {
        payments: withOrderTipOnFirstPayment(
          buildSpaSettlePayments({
            cardMethodId: cardMethod.id,
            guestCardId: card.id,
            cashMethodId: cashMethod?.id,
            cashAmount: cashValue,
          }),
          tipValue
        ),
        posSessionId: context.posSessionId,
        ...(tipValue > 0 ? { tipAmount: tipValue.toFixed(4) } : {}),
        idempotencyKey: spaSettleKey(session.id),
      });
      // The cash the guest handed over first, then the card for what it leaves.
      const paidTotal = Number(result.totalPaid || result.grandTotal);
      const cash = Math.min(cashValue, paidTotal);
      await printPaid(result, endAt, [
        ...(cash > 0
          ? [{ name: cashMethod?.name || "Cash", amount: cash.toFixed(4) }]
          : []),
        { name: cardMethod.name || "Payment", amount: (paidTotal - cash).toFixed(4) },
      ]);
      setPaid(result);
      writeResume(kind, null);
      setWallet(await getWallet(wallet.id));
      await fetchBoard();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.pay"));
    } finally {
      setIsPaying(false);
    }
  };

  const confirmRoomFee = async (fee: ChosenFee) => {
    if (!session?.salesOrderId) return;
    setActionError(null);
    setIsAddingFee(true);
    try {
      await addExtraFeeLine({ orderId: session.salesOrderId }, fee);
      await refreshBill(session);
      setExtraFeeOpen(false);
      setNotice(t("cashier.extraFee.added"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("cashier.errors.addProduct"));
    } finally {
      setIsAddingFee(false);
    }
  };

  const resetSplit = () => {
    setIsSplitMode(false);
    setSplitTenders([]);
  };

  const chooseEndPayMethod = (methodId: string) => {
    setPayMethodId(methodId);
    if (isCardMethod(methodId) && !card) requestCard("pay");
  };

  const chooseEndBillOption = (field: "includeTax" | "includeServiceCharge", value: boolean) => {
    billOptions.choose(field, value);
    resetSplit();
    setActionError(null);
  };

  const openEndSplit = () => {
    if (isSplitMode) return;
    setIsSplitMode(true);
    setSplitTenders([]);
    setPayAmount(endBillTotal.toFixed(2));
  };

  const addEndTender = () => {
    setActionError(null);
    if (!endPayMethodId) {
      setActionError(t("cashier.errors.paymentMethodRequired"));
      return;
    }
    if (isCardMethod(endPayMethodId)) {
      if (!card || !wallet) {
        requestCard("pay");
        return;
      }
      if (splitTenders.some((tender) => isCardMethod(tender.paymentMethodId))) {
        setActionError(tr("errors.oneCardPerBill"));
        return;
      }
    }
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError(t("cashier.errors.splitAmount"));
      return;
    }
    const tenderAmount = Math.min(amount, remainingReceivable(endBillTotal, splitTenders));
    if (tenderAmount <= 0) {
      setActionError(t("cashier.errors.splitComplete"));
      return;
    }
    const next = [
      ...splitTenders,
      {
        id: `split-${Date.now()}-${splitTenders.length}`,
        paymentMethodId: endPayMethodId,
        amount: tenderAmount.toFixed(4),
      },
    ];
    setSplitTenders(next);
    setPayAmount(remainingReceivable(endBillTotal, next).toFixed(2));
  };

  const removeEndTender = (tenderId: string) => {
    const next = splitTenders.filter((tender) => tender.id !== tenderId);
    setSplitTenders(next);
    setPayAmount(remainingReceivable(endBillTotal, next).toFixed(2));
  };

  /**
   * Pays a bill paid at the end, as the cashier pays one: one method or a split.
   * The room is closed first, which writes its time; if that changes the total,
   * the new one is shown and the cashier confirms again.
   */
  const handleEndBillPay = async () => {
    if (!session?.salesOrderId) return;
    if (timesBackwards) {
      setActionError(tr("errors.manualTimes"));
      return;
    }
    const orderDiscount = Math.max(0, Number(billDiscount) || 0);
    if (orderDiscount > 0 && discountReasons.length && !billDiscountReasonId) {
      setActionError(t("cashier.errors.discountReasonRequired"));
      return;
    }
    const tenders = isSplitMode
      ? splitTenders
      : endPayMethodId
        ? [{ id: "single", paymentMethodId: endPayMethodId, amount: endBillTotal.toFixed(4) }]
        : [];
    if (!tenders.length) {
      setActionError(t("cashier.errors.paymentMethodRequired"));
      return;
    }
    if (isSplitMode && remainingReceivable(endBillTotal, splitTenders) > 0.009) {
      setActionError(t("cashier.payment.splitTenderCount", { count: splitTenders.length }));
      return;
    }
    const usesCard = tenders.some((tender) => isCardMethod(tender.paymentMethodId));
    if (usesCard && (!card || !wallet)) {
      requestCard("pay");
      return;
    }
    setActionError(null);
    setIsPaying(true);
    try {
      const context = await requireCashierContext();
      let endAt = session.closedAt || session.endsAt || "";
      if (!billClosed) {
        const closed = await closeSession(session.id, manualClose());
        endAt = closed.asOf || new Date().toISOString();
        setSession({ ...session, sessionState: "CLOSED" });
      }
      const finalBill = await fetchOrderBill(session.salesOrderId, billOptions.query);
      if (billOptions.changed) billOptions.acceptBill(finalBill);
      const finalTotal = Number(finalBill.grandTotal) + tipValue;
      if (Math.abs(finalTotal - endBillTotal) > 0.009) {
        resetSplit();
        await refreshBill({ ...session, sessionState: "CLOSED" });
        setActionError(t("cashier.errors.billUpdated", { amount: money(finalTotal) }));
        return;
      }
      const result =
        Number(finalBill.grandTotal) > 0
          ? await settleOrder(session.salesOrderId, {
              // The card pays what the others leave, after its member discount.
              payments: withOrderTipOnFirstPayment(
                tenders.map((tender) =>
                  isCardMethod(tender.paymentMethodId)
                    ? { paymentMethodId: tender.paymentMethodId, guestCardId: card!.id }
                    : { paymentMethodId: tender.paymentMethodId, amount: tender.amount }
                ),
                tipValue
              ),
              posSessionId: context.posSessionId,
              ...(tipValue > 0 ? { tipAmount: tipValue.toFixed(4) } : {}),
              ...(orderDiscount > 0
                ? { totalDiscount: orderDiscount.toFixed(4) }
                : {}),
              ...(billDiscountReasonId ? { discountReasonId: billDiscountReasonId } : {}),
              ...(billOptions.changed
                ? {
                    includeTax: billOptions.includeTax,
                    includeServiceCharge: billOptions.includeServiceCharge,
                  }
                : {}),
              idempotencyKey: spaSettleKey(session.id),
            })
          : {
              orderId: session.salesOrderId,
              orderNumber: "",
              grandTotal: "0.0000",
              totalPaid: "0.0000",
              change: "0.0000",
              status: "COMPLETED",
            };
      // Each method on its own row, in the order it was taken; the card takes
      // whatever the others leave, which is how the settle splits it.
      const paidTotal = Number(result.totalPaid || result.grandTotal);
      let tendered = 0;
      const rows = tenders.map((tender) => {
        const name =
          endPayMethods.find((method) => method.id === tender.paymentMethodId)?.name || "Payment";
        if (isCardMethod(tender.paymentMethodId)) return { name, amount: "" };
        const amount = Number(tender.amount || 0);
        tendered += amount;
        return { name, amount: amount.toFixed(4) };
      });
      const cardRow = rows.find((row) => !row.amount);
      if (cardRow) cardRow.amount = Math.max(0, paidTotal - tendered).toFixed(4);
      await printPaid(result, endAt, rows);
      setPaid(result);
      resetSplit();
      writeResume(kind, null);
      if (usesCard && wallet) setWallet(await getWallet(wallet.id));
      await fetchBoard();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : tr("errors.pay"));
    } finally {
      setIsPaying(false);
    }
  };

  const goToPay = () => {
    if (pending.length) {
      setActionError(tr("errors.pendingItems"));
      return;
    }
    // A bill paid at the end opens the pay screen; the card is tapped there if chosen.
    if (atEnd && !quote?.prepaid) setStep("pay");
    else requestCard("pay");
  };

  /**
   * Closing the room order's menu leaves it for the board, which lists the room
   * again. Items still in the tray would go with it, so say so instead.
   */
  const closeRoomOrder = () => {
    if (pending.length) {
      setActionError(tr("errors.pendingItems"));
      return;
    }
    void fetchBoard();
    backToBoard();
  };

  const handleSaveRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeLocationId) return;
    setActionError(null);
    const minutes = Number(roomForm.treatmentMinutes);
    // A SPA room is only where a treatment happens; its time and price come from
    // the service package sold.
    const terms = isSpa
      ? {
          roomNumber: roomForm.roomNumber.trim(),
          name: roomForm.name.trim(),
          capacity: Number(roomForm.capacity),
        }
      : {
          roomNumber: roomForm.roomNumber.trim(),
          name: roomForm.name.trim(),
          capacity: Number(roomForm.capacity),
          sessionPrice: Number(roomForm.sessionPrice),
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
      setActionError(caught instanceof Error ? caught.message : tr("errors.saveRoom"));
    }
  };

  const openRoomManager = (managed: SpaRoom) => {
    setEditingRoom(managed);
    setRoomForm({
      roomNumber: managed.roomNumber,
      name: managed.name,
      capacity: String(managed.capacity),
      sessionPrice: managed.sessionPrice == null ? "" : String(managed.sessionPrice),
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
      ? tr("confirmAddTitle")
      : cardPrompt === "open"
        ? tr("confirmStartTitle", { room: room?.roomNumber || "" })
        : cardPrompt === "extend"
          ? multiRate
            ? tr("confirmExtendMinutes", { minutes: extendBoughtMinutes })
            : tr("confirmExtendTitle", { count: isSpa ? bookingTotals.count : extendCount })
          : tr("confirmPayTitle");

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#080808] p-4 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h1 className="text-xl font-bold">{tr("boardTitle")}</h1>
          <p className="text-sm text-slate-400">{tr(`steps.${step}`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          {/* Tablet-order printing sits here, not over the bill: the board has no side rail. */}
          <div
            id="pos-tablet-print-settings"
            className="relative [&_details>label]:absolute [&_details>label]:right-0 [&_details>label]:top-full [&_details>label]:z-50 [&_details>label]:mt-1 [&_details>label]:w-60 [&_details>label]:rounded [&_details>label]:border [&_details>label]:border-white/10 [&_details>label]:bg-slate-900"
          />
          {step !== "rooms" && !(step === "pay" && billClosed) && !paid ? (
            <Button variant="secondary" onClick={goBack}>
              {step === "pay" ? t("cardTopup.back") : tr("backToBoard")}
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
            {tr("addRoom")}
          </Button>
        </div>
      </header>


      {step === "rooms" ? (
        <>
          {!isSpa ? (
            <HostessStrip
              rows={hostessRows}
              onOpenRoom={(row) => {
                const target = rooms.find(
                  (item) => item.id === row.roomId || item.roomNumber === row.roomNumber
                );
                if (target) selectRoom(target);
              }}
            />
          ) : null}
          <div className="my-3 flex gap-2">
            {(["ALL", "AVAILABLE", "ACTIVE"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded px-3 py-2 text-sm font-semibold ${
                  filter === value
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                onClick={() => setFilter(value)}
              >
                {tr(`filters.${value.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleRooms.length === 0 ? (
              <p className="mt-10 text-center text-slate-400">{tr("noRooms")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleRooms.map((item) => (
                  <SpaRoomTile
                    kind={kind}
                    key={item.id}
                    room={item}
                    nowMs={nowMs}
                    hostessNames={isSpa ? undefined : hostessesIn(item)}
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
                  {tr("sessionOption", {
                    time: new Date(item.openedAt).toLocaleTimeString(),
                    count: item.guestCount,
                  })}
                </p>
                <p className="mt-2 text-sm">
                  {warning.level === "EXPIRED"
                    ? tr("timeUp")
                    : item.endsAt
                      ? tr("minutesRemaining", { count: warning.remainingMinutes })
                      : tr(`status.${item.sessionState.toLowerCase()}`)}
                </p>
              </button>
            );
          })}
          {openSessions.length === 0 && room.status === "AVAILABLE" ? (
            <form
              className="space-y-3 rounded-lg border border-slate-600 bg-slate-900 p-4"
              onSubmit={handleOpenSession}
            >
              <p className="font-bold">{tr("newSession", { room: room.roomNumber })}</p>
              {isSpa ? (
                <>
                  <PackagePicker
                    kind={kind}
                    packages={spaPackages}
                    choice={packageChoice}
                    discounts={promotions.discounts}
                    onChange={(id, delta) => setPackageChoice((current) => changeChoice(current, id, delta))}
                  />
                  {bookingTotals.count ? (
                    <p className="text-sm text-slate-300">
                      {tr("packagesSummary", {
                        count: bookingTotals.count,
                        minutes: bookingTotals.minutes,
                      })}
                    </p>
                  ) : null}
                  {freePackageNotes}
                  {roomCharges && (roomCharges.now.length || roomCharges.atEnd.length || optionalCharges.length) ? (
                    <div className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
                      <p className="text-sm font-semibold">{tr("roomCharges")}</p>
                      {roomCharges.now
                        .filter((line) => line.charge.autoApply)
                        .map((line) => (
                          <p key={line.charge.variantId} className="flex justify-between text-sm text-slate-300">
                            <span>
                              {line.charge.name}
                              {line.units > 1 ? ` × ${line.units}` : ""}
                              <span className="ml-1 text-xs text-slate-500">{tr("roomChargeAuto")}</span>
                              {line.free ? (
                                <span className="ml-1 text-xs text-emerald-300">
                                  {tr("roomChargeFree", { count: line.free.units })}
                                </span>
                              ) : null}
                            </span>
                            <span>{money(line.amount - saving(line.charge.variantId))}</span>
                          </p>
                        ))}
                      {optionalCharges.length ? (
                        <div className="flex flex-wrap gap-2">
                          {optionalCharges.map((item) => {
                            const on = pickedCharges.includes(item.variantId);
                            return (
                              <button
                                key={item.variantId}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  setPickedCharges((current) =>
                                    on
                                      ? current.filter((id) => id !== item.variantId)
                                      : [...current, item.variantId]
                                  )
                                }
                                className={`rounded border px-2 py-1 text-sm ${
                                  on ? "border-emerald-500 bg-emerald-950/40" : "border-slate-700"
                                }`}
                              >
                                {on ? "✓ " : "+ "}
                                {item.name} · {money(item.unitPrice)}
                                {item.soldBy === "TIME"
                                  ? ` / ${tr("roomChargeBlock", { minutes: item.blockMinutes })}`
                                  : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      {roomCharges.now
                        .filter((line) => !line.charge.autoApply && (line.free || saving(line.charge.variantId)))
                        .map((line) => (
                          <p key={line.charge.variantId} className="flex justify-between text-sm text-emerald-300">
                            <span>
                              {line.charge.name}
                              {line.free ? ` · ${tr("roomChargeFree", { count: line.free.units })}` : ""}
                            </span>
                            <span>{money(line.amount - saving(line.charge.variantId))}</span>
                          </p>
                        ))}
                      {roomCharges.atEnd.map((item) => (
                        <p key={item.variantId} className="text-xs text-slate-400">
                          {tr("roomChargeClock", { name: item.name })}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
              <>
              {rentalPicksPicker(
                startPicks,
                (variantId, delta) =>
                  setStartPicks((current) => changeRentalPick(current, rentals, variantId, delta)),
                (variantId) =>
                  setStartPicks((current) => toggleRentalPick(current, rentals, variantId))
              )}
              {multiRate ? null : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">{tr("sessions")}</span>
                  <div className="flex items-center rounded bg-slate-800">
                    <button
                      type="button"
                      aria-label={tr("fewerSessions")}
                      className="h-9 w-9 text-lg disabled:opacity-40"
                      disabled={sessionCount <= minimumUnits}
                      onClick={() => setSessionCount((count) => Math.max(minimumUnits, count - 1))}
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-semibold">{sessionCount}</span>
                    <button
                      type="button"
                      aria-label={tr("moreSessions")}
                      className="h-9 w-9 text-lg"
                      onClick={() => setSessionCount((count) => count + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              <p className="text-sm text-slate-300">
                {tr("sessionsSummary", {
                  minutes: startMinutes,
                  perSession: unitMinutes,
                })}
                {startPriced ? ` · ${money(startCharge)}` : ""}
              </p>
              {startSaving > 0 && !session ? (
                <p className="text-sm text-emerald-300">
                  {tr("promotionDiscount")} −{money(startSaving)}
                </p>
              ) : null}
              {freeTimeNotes(
                startFree,
                "rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-sm text-emerald-200"
              )}
              </>
              )}
              <label className="block text-sm text-slate-300">
                {tr("guestCountLabel")}
                <input
                  type="number"
                  min={1}
                  max={room.capacity}
                  value={guestCount}
                  onChange={(event) => setGuestCount(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              {isSpa ? (
                <Button type="submit" isLoading={isLoading} disabled={!bookingTotals.count}>
                  {!bookingTotals.count
                    ? tr("choosePackage")
                    : startsAtEnd
                      ? tr("startOnBill", { amount: money(bookingDue + roomChargesDue) })
                      : tr("startAndPay", { amount: money(bookingDue + roomChargesDue) })}
                </Button>
              ) : (
                <Button
                  type="submit"
                  isLoading={isLoading}
                  disabled={multiRate && !startPlan.length}
                >
                  {!startPriced
                    ? tr("startSession")
                    : startsAtEnd
                      ? tr("startOnBill", { amount: money(startCharge) })
                      : tr("startAndPay", { amount: money(startCharge) })}
                </Button>
              )}
            </form>
          ) : null}
          {openSessions.length === 0 && room.status !== "AVAILABLE" ? (
            <p className="text-slate-400">
              {tr("roomNotAvailable", {
                status: tr(`status.${room.status.toLowerCase()}`),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {(step === "menu" || step === "pay") && session ? (
        <div className="mt-4 grid shrink-0 flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:shrink lg:grid-cols-[24rem_minmax(0,1fr)]">
          <SpaBillPanel
            kind={kind}
            room={room}
            session={liveSession || session}
            card={card}
            wallet={wallet}
            quote={quote}
            lines={orderLines}
            itemNames={itemNames}
            nowMs={nowMs}
            isBusy={isLoading || isPaying || isAdding}
            tip={tipValue}
            billClosed={billClosed}
            paid={Boolean(paid)}
            primaryLabel={
              quote?.prepaid
                ? tr("endTreatment")
                : step === "menu"
                  ? tr("goToPay")
                  : tr("addServices")
            }
            onPrimary={() =>
              quote?.prepaid
                ? pending.length
                  ? setActionError(tr("errors.pendingItems"))
                  : setConfirmEnd(true)
                : step === "menu"
                  ? goToPay()
                  : setStep("menu")
            }
            onExtend={() => {
              setRentalVariantId(billRental?.variantId || "");
              setExtendCount(isSpa ? 1 : billRental?.minimumUnits || 1);
              setExtendPicks(
                billRental
                  ? { [billRental.variantId]: Math.max(1, billRental.minimumUnits) }
                  : {}
              );
              setExtendChoice({});
              setShowExtend(true);
            }}
            onTogglePause={() => void togglePause()}
            onOpenBill={endBillOrderId ? () => setBillOptionsOpen(true) : undefined}
            onMoveRoom={!paid ? () => setFloorMode("move") : undefined}
            onSplitRoom={endBillOrderId && !paid ? () => setFloorMode("split") : undefined}
            onMergeRoom={endBillOrderId && !paid ? () => setFloorMode("merge") : undefined}
            onChangeQuantity={(line) => void reduceLine(line)}
            onAddAnother={addAnother}
            onRemoveLine={(group) => void removeLines(group)}
            pending={pending}
            onPendingChange={(variantId, delta) =>
              setPending((current) => changePending(current, variantId, delta))
            }
            onClearPending={() => setPending([])}
            onCommitPending={addPendingToBill}
            onToggleFoc={(key) => setPending((current) => toggleOneFoc(current, key))}
            onChangeCard={forgetCard}
            promotions={promotions.running}
            pendingDiscounts={promotions.discounts}
            promotionName={promotions.promotionName}
            packageVariantIds={packageVariantIds}
            rentalVariantIds={rentalVariantIds}
            breakdown={endBreakdown}
            extraFeeLabel={t("cashier.extraFee.button")}
            onAddExtraFee={endBillOrderId && !paid ? () => setExtraFeeOpen(true) : undefined}
            orderers={orderers}
            onOrderedBy={(key, hostess) => setPending((current) => setOrderedBy(current, key, hostess))}
            onNotePending={setNoteFor}
            orderedByName={orderedByName}
            menuPrice={menuPriceFor}
            onEditLine={endBillOrderId && !paid ? setEditingRow : undefined}
          />

          {step === "menu" && !menuAllowed && isSpa ? (
            <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-5">
              {roomChargeChips}
              <div>
                <h2 className="text-lg font-semibold text-white">{tr("addPackageTitle")}</h2>
                <p className="mt-1 text-sm text-slate-400">{tr("addPackageHint")}</p>
              </div>
              <PackagePicker
                kind={kind}
                packages={spaPackages}
                choice={extendChoice}
                discounts={promotions.discounts}
                onChange={(id, delta) => setExtendChoice((current) => changeChoice(current, id, delta))}
              />
              {bookingTotals.count ? (
                <p className="text-sm text-slate-300">
                  {tr("packagesSummary", { count: bookingTotals.count, minutes: bookingTotals.minutes })}
                  {` · ${money(bookingDue)}`}
                </p>
              ) : null}
              {freePackageNotes}
              <Button
                isLoading={isAdding}
                disabled={!bookingTotals.count || billClosed}
                onClick={() => (atEnd ? void extendOnBill() : requestCard("extend"))}
              >
                {atEnd ? tr("addToBillShort") : tr("extendAndPay")}
              </Button>
            </div>
          ) : step === "menu" && !menuAllowed ? (
            <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">{tr("menuOffTitle")}</h2>
              <p className="text-sm text-slate-300">{tr("menuOffBody")}</p>
            </div>
          ) : step === "menu" ? (
            <div className="flex min-h-0 flex-col gap-2">
              {roomChargeChips}
              <div className="min-h-0 flex-1">
                <ProductMenu
                  products={menuProducts}
                  groupByCategory
                  variantsByProductId={variantsByProductId}
                  orderedProductQuantities={pendingByProduct}
                  onLoadVariants={fetchProductVariants}
                  onAdd={handleAddProduct}
                  onClose={closeRoomOrder}
                  offerOptions
                  quickNotes={venue.quickNotes}
                />
              </div>
            </div>
          ) : paid ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">{tr("paidTitle")}</h2>
              <p className="mt-3">
                {tr("paidSummary", {
                  amount: money(paid.grandTotal),
                  order: paid.orderNumber,
                })}
              </p>
              {Number(paid.change) > 0 ? (
                <p>{tr("change", { amount: money(paid.change) })}</p>
              ) : null}
              <p className="mt-2 text-sm text-slate-400">
                {tr("balance", { amount: money(wallet?.balance) })}
              </p>
              <Button className="mt-4" onClick={backToBoard}>
                {tr("nextGuest")}
              </Button>
            </div>
          ) : endBillOrderId ? (
            <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-lg border border-slate-700 lg:min-h-0">
              <div className="min-h-0 flex-1">
                <PaymentView
                  methods={endPayMethods}
                  selectedMethodId={endPayMethodId}
                  paymentAmount={isSplitMode ? payAmount : endBillTotal.toFixed(2)}
                  total={endBillTotal.toFixed(4)}
                  breakdown={endBreakdown}
                  billOptions={{
                    includeTax: billOptions.includeTax,
                    includeServiceCharge: billOptions.includeServiceCharge,
                    isLoading: billOptions.isLoading,
                    disabled: isPaying,
                    error: billOptions.error,
                    onChange: chooseEndBillOption,
                  }}
                  isSplitMode={isSplitMode}
                  splitTenders={splitTenders}
                  isLoading={isPaying || billOptions.isLoading || Boolean(billOptions.error)}
                  onSelectMethod={chooseEndPayMethod}
                  onPaymentAmountChange={setPayAmount}
                  onOpenSplit={openEndSplit}
                  onClosePay={() => {
                    resetSplit();
                    if (!billClosed) setStep("menu");
                  }}
                  onAddTender={addEndTender}
                  onRemoveTender={removeEndTender}
                />
              </div>
              {manualTimesFields ? (
                <div className="shrink-0 border-t border-white/10 bg-[#202020] p-3">
                  {manualTimesFields}
                </div>
              ) : null}
              <div className="grid shrink-0 gap-2 border-t border-white/10 bg-[#202020] p-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-end">
                <label className="block text-sm">
                  {tr("tip")}
                  <input
                    type="number"
                    min={0}
                    value={tip}
                    onChange={(event) => {
                      setTip(event.target.value);
                      resetSplit();
                    }}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                  />
                </label>
                {card && wallet ? (
                  <p className="text-xs text-slate-400">
                    {tr("balance", { amount: money(wallet.balance) })}
                    {wallet.discountBpsSnapshot
                      ? ` · ${tr("memberDiscount", {
                          tier: wallet.tierNameSnapshot,
                          percent: wallet.discountBpsSnapshot / 100,
                        })}`
                      : ""}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex items-end gap-2">
                  <Button
                    variant="secondary"
                    className="min-w-0 px-3 leading-tight"
                    disabled={isPaying}
                    onClick={() => void printCheckBill()}
                  >
                    {tr("printBill")}
                  </Button>
                  <Button
                    isLoading={isPaying}
                    disabled={billOptions.isLoading || Boolean(billOptions.error)}
                    onClick={() => void handleEndBillPay()}
                  >
                    {billClosed ? tr("retryPay") : tr("confirmPay")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-700 p-5">
              <h2 className="text-lg font-bold">{tr("payTitle")}</h2>
              {manualTimesFields}
              {wallet?.discountBpsSnapshot ? (
                <p className="text-sm text-slate-300">
                  {tr("memberDiscount", {
                    tier: wallet.tierNameSnapshot,
                    percent: wallet.discountBpsSnapshot / 100,
                  })}
                </p>
              ) : null}
              <label className="block text-sm">
                {tr("tip")}
                <input
                  type="number"
                  min={0}
                  value={tip}
                  onChange={(event) => setTip(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                />
              </label>
              {cashMethod ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={splitCash}
                    onChange={(event) => setSplitCash(event.target.checked)}
                  />
                  {tr("splitCash")}
                </label>
              ) : null}
              {splitCash ? (
                <label className="block text-sm">
                  {tr("cashAmount")}
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
                {tr("estimatedCard", { amount: money(estimatedCard) })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={!wallet} onClick={openTopup}>
                  {tr("topUpCard")}
                </Button>
                <Button isLoading={isPaying} onClick={() => void handlePay()}>
                  {billClosed ? tr("retryPay") : tr("confirmPay")}
                </Button>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                disabled={isPaying}
                onClick={() => void printCheckBill()}
              >
                {tr("printBill")}
              </Button>
              {atEnd && otherMethods.length ? (
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-sm font-semibold">{tr("payOtherTitle")}</p>
                  <p className="text-xs text-slate-400">
                    {tr("payOtherHint", { amount: money(Number(quote?.amountDue || quote?.runningTotal || 0) + tipValue) })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {otherMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        aria-pressed={otherMethodId === method.id}
                        onClick={() => setOtherMethodId(method.id)}
                        className={`rounded border px-3 py-1.5 text-sm ${
                          otherMethodId === method.id
                            ? "border-emerald-500 bg-emerald-500/15"
                            : "border-slate-700"
                        }`}
                      >
                        {method.name}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    isLoading={isPaying}
                    disabled={!otherMethodId}
                    onClick={() => void handlePayOther()}
                  >
                    {tr("payWith", {
                      method: otherMethods.find((item) => item.id === otherMethodId)?.name || "",
                    })}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {billOptionsOpen && endBillOrderId && session ? (
        <BillOptionsDialog
          title={t("cashier.billOptions.titleWithTable")}
          bill={
            <>
              <fieldset
                className="space-y-1 rounded-md border border-slate-800 bg-slate-900/60 p-2"
                disabled={isPaying || billOptions.isLoading || billClosed}
              >
                <legend className="sr-only">{t("cashier.payment.options")}</legend>
                {(["includeTax", "includeServiceCharge"] as const).map((field) => (
                  <label
                    key={field}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={billOptions[field]}
                      onChange={(event) => chooseEndBillOption(field, event.target.checked)}
                      className="h-5 w-5 accent-blue-500"
                    />
                    {t(`cashier.payment.${field}`)}
                  </label>
                ))}
                <p className="px-1 pb-1 text-xs text-slate-400">
                  {t("cashier.payment.optionsHint")}
                </p>
              </fieldset>
              <OrderAdjustments
                discountAmount={billDiscount}
                discountReasonId={billDiscountReasonId}
                discountReasons={discountReasons}
                serviceCharge={String(
                  serverBill?.serviceCharge ?? quote?.servicesCharge ?? "0"
                )}
                tipAmount={tip}
                disabled={isPaying || billOptions.isLoading || billClosed}
                onDiscountAmountChange={(value) => {
                  setBillDiscount(value);
                  resetSplit();
                }}
                onDiscountReasonChange={setBillDiscountReasonId}
                onRemoveDiscount={() => {
                  setBillDiscount("0.0000");
                  setBillDiscountReasonId("");
                  resetSplit();
                }}
                onTipAmountChange={(value) => {
                  setTip(value);
                  resetSplit();
                }}
              />
              {billOptions.error ? (
                <p className="text-xs text-red-400">{billOptions.error}</p>
              ) : null}
              <p className="flex justify-between border-t border-slate-800 pt-2 text-base font-bold">
                <span>{tr("estimatedTotal")}</span>
                <span>{money(endBillTotal)}</span>
              </p>
            </>
          }
          onClose={() => setBillOptionsOpen(false)}
        />
      ) : null}

      {floorMode && room && session ? (
        <RoomFloorDialog
          kind={kind}
          mode={floorMode}
          room={room}
          session={liveSession || session}
          rooms={rooms}
          lines={orderLines}
          itemNames={itemNames}
          isBusy={isMovingRoom}
          onMove={(roomId) =>
            void changeRooms(
              () => moveRoom(session.id, roomId),
              (room) => tr("floor.moved", { room })
            )
          }
          onMerge={(sourceSessionId) =>
            void changeRooms(
              () => mergeRoom(session.id, sourceSessionId),
              () => tr("floor.merged")
            )
          }
          onSplit={(target, lines) => {
            const toRoom =
              "roomId" in target
                ? target.roomId
                : rooms.find((item) => item.sessions.some((each) => each.id === target.sessionId))
                    ?.id;
            void changeRooms(
              async () => {
                const context = await requireCashierContext();
                return splitRoom(session.id, target, lines, {
                  posRegisterId: context.posRegisterId,
                  openedByPosSessionId: context.posSessionId,
                });
              },
              () => tr("floor.splitDone", { room: roomNumberOf(toRoom || "") })
            );
          }}
          onClose={() => setFloorMode(null)}
        />
      ) : null}

      {noteFor ? (() => {
        const item = pending.find((entry) => pendingKey(entry) === noteFor);
        return item ? (
          <ItemNoteDialog
            name={item.name}
            note={item.note}
            quickNotes={venue.quickNotes}
            onSave={(note) => {
              setPending((current) => setPendingNote(current, noteFor, note));
              setNoteFor(null);
            }}
            onClose={() => setNoteFor(null)}
          />
        ) : null;
      })() : null}

      {editingRow ? (() => {
        const [line] = editingRow.lines;
        const isBooked =
          line.variantId === room?.rateVariantId ||
          rentalVariantIds.has(line.variantId) ||
          packageVariantIds.has(line.variantId);
        const fee = isFeeLine(line);
        return (
          <LineEditDialog
            key={editingRow.key}
            name={
              isBooked && !packageVariantIds.has(line.variantId)
                ? tr("treatmentCharge")
                : line.productName || itemNames[line.variantId] || tr("item")
            }
            options={modifierPrintText(line.selectedModifiers).names}
            quantity={editingRow.quantity}
            unitPrice={Number(line.unitPrice || 0)}
            menuPrice={menuPriceFor(line)}
            isFoc={isGivenFree(line)}
            isFee={fee}
            orderers={
              fee || isBooked || serviceVariantIds.has(line.variantId) ? undefined : orderers
            }
            orderedBy={line.hostessId}
            note={line.note}
            quickNotes={fee || isBooked ? undefined : venue.quickNotes}
            canRemove={!isBooked}
            isBusy={isSavingLine}
            onSave={(edit) => void editRow(editingRow, edit)}
            onRemove={() => {
              setEditingRow(null);
              void removeLines(editingRow.lines);
            }}
            onClose={() => setEditingRow(null)}
          />
        );
      })() : null}

      {extraFeeOpen ? (
        <ExtraFeeDialog
          fees={extraFees}
          isBusy={isAddingFee}
          onConfirm={(fee) => void confirmRoomFee(fee)}
          onClose={() => setExtraFeeOpen(false)}
        />
      ) : null}

      {hostessFor ? (
        <HostessPicker
          serviceName={hostessFor.product.name}
          onPick={pickHostess}
          onCancel={() => setHostessFor(null)}
        />
      ) : null}

      {cardPrompt ? (
        <CardTapDialog
          kind={kind}
          title={cardPromptTitle}
          error={cardPromptError}
          isBusy={isCheckingCard}
          onCardRead={(uid) => void handleCardRead(uid)}
          onCancel={() => setCardPrompt(null)}
          otherMethods={cardPrompt !== "pay" ? otherMethods : []}
          onPayWith={payWith}
          onPrintBill={cardPrompt === "pay" ? () => void printCheckBill() : undefined}
        >
          {cardPrompt === "add" ? (
            <>
              {paidPending(pending).map((item) => (
                <p key={item.variantId} className="flex justify-between">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{money(item.unitPrice * item.quantity)}</span>
                </p>
              ))}
              {pendingDue < pendingTotal(pending) ? (
                <p className="flex justify-between text-emerald-300">
                  <span>{tr("promotionDiscount")}</span>
                  <span>−{money(pendingTotal(pending) - pendingDue)}</span>
                </p>
              ) : null}
              <p className="mt-1 flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span>{tr("newItemsTotal")}</span>
                <span>{money(pendingDue)}</span>
              </p>
            </>
          ) : isSpa && (cardPrompt === "extend" || cardPrompt === "open") ? (
            <>
              {chosenPackages(booking, spaPackages).map(({ package: item, quantity }) => (
                <p key={item.id} className="flex justify-between gap-2">
                  <span>
                    {item.name} × {quantity}
                  </span>
                  <span>{money(item.price * quantity)}</span>
                </p>
              ))}
              {cardPrompt === "open"
                ? roomCharges?.now.map((line) => (
                    <p key={line.charge.variantId} className="flex justify-between gap-2">
                      <span>
                        {line.charge.name}
                        {line.units > 1 ? ` × ${line.units}` : ""}
                        {line.free ? ` · ${tr("roomChargeFree", { count: line.free.units })}` : ""}
                      </span>
                      <span>{money(line.amount)}</span>
                    </p>
                  ))
                : null}
              {freePackages.map(({ package: item, free }) => (
                <p key={item.id} className="flex justify-between gap-2 text-emerald-300">
                  <span>{tr("freePackageAdded", { count: free.units, package: item.name, name: free.name })}</span>
                  <span>{money(0)}</span>
                </p>
              ))}
              {bookingDue < bookingTotals.price || (cardPrompt === "open" && roomChargesSaving) ? (
                <p className="flex justify-between text-emerald-300">
                  <span>{tr("promotionDiscount")}</span>
                  <span>
                    −{money(bookingTotals.price - bookingDue + (cardPrompt === "open" ? roomChargesSaving : 0))}
                  </span>
                </p>
              ) : null}
              <p className="mt-1 flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span>{tr("packagesSummary", { count: bookingTotals.count, minutes: bookingTotals.minutes })}</span>
                <span>{money(bookingDue + (cardPrompt === "open" ? roomChargesDue : 0))}</span>
              </p>
            </>
          ) : cardPrompt === "extend" ? (
            <p className="flex justify-between font-semibold">
              <span>
                {tr("sessionsSummary", {
                  minutes: extendMinutes,
                  perSession: unitMinutes,
                })}
              </span>
              {extendPriced ? <span>{money(extendCharge)}</span> : null}
            </p>
          ) : cardPrompt === "open" ? (
            <>
              <p className="flex justify-between gap-2">
                <span>
                  {multiRate
                    ? tr("startSummaryMinutes", {
                        room: room?.roomNumber || "",
                        minutes: startMinutes,
                        count: Math.max(1, Number(guestCount) || 1),
                      })
                    : tr("startSummary", {
                        room: room?.roomNumber || "",
                        sessions: sessionCount,
                        minutes: startMinutes,
                        count: Math.max(1, Number(guestCount) || 1),
                      })}
                </span>
                {startPriced ? <span>{money(startCharge)}</span> : null}
              </p>
              {startSaving ? (
                <p className="flex justify-between text-emerald-300">
                  <span>{tr("promotionDiscount")}</span>
                  <span>−{money(startSaving)}</span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="flex justify-between font-semibold">
              <span>{tr("runningTotal")}</span>
              <span>{money(quote?.runningTotal)}</span>
            </p>
          )}
        </CardTapDialog>
      ) : null}

      {showFoc && session ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-5">
            <div>
              <h2 className="text-lg font-bold">
                {tr("focTitle", { room: room?.roomNumber || "" })}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{tr("focDescription")}</p>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
              {focPending(pending).map((item) => (
                <p key={item.variantId} className="flex justify-between gap-2">
                  <span className="truncate">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="shrink-0 text-slate-500 line-through">
                    {money(item.unitPrice * item.quantity)}
                  </span>
                </p>
              ))}
              <p className="mt-1 flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span>{tr("toPay")}</span>
                <span>0</span>
              </p>
            </div>
            <label className="block text-sm">
              {tr("focReason")}
              <input
                value={focReason}
                onChange={(event) => setFocReason(event.target.value)}
                list="foc-reasons"
                maxLength={100}
                placeholder={tr("focReasonPlaceholder")}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                autoFocus
              />
              <datalist id="foc-reasons">
                {discountReasons.map((reason) => (
                  <option key={reason.id} value={reason.name} />
                ))}
              </datalist>
            </label>
            {discountReasons.length ? (
              <div className="flex flex-wrap gap-1.5">
                {discountReasons.slice(0, 6).map((reason) => (
                  <button
                    key={reason.id}
                    type="button"
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      focReason === reason.name
                        ? "bg-slate-100 text-slate-900"
                        : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setFocReason(reason.name)}
                  >
                    {reason.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setShowFoc(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                isLoading={isGivingFoc}
                disabled={!focReason.trim()}
                onClick={() => void confirmFoc()}
              >
                {tr("focConfirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showExtend && session ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-5">
            <h2 className="text-lg font-bold">{tr("extendTitle", { room: room?.roomNumber || "" })}</h2>
            {isSpa ? (
              <>
                <PackagePicker
                  kind={kind}
                  packages={spaPackages}
                  choice={extendChoice}
                  discounts={promotions.discounts}
                  onChange={(id, delta) => setExtendChoice((current) => changeChoice(current, id, delta))}
                />
                {bookingTotals.count ? (
                  <p className="text-sm text-slate-300">
                    {tr("packagesSummary", { count: bookingTotals.count, minutes: bookingTotals.minutes })}
                    {` · ${money(bookingDue)}`}
                  </p>
                ) : null}
                {freePackageNotes}
              </>
            ) : (
              <>
            {rentalPicksPicker(
              extendPicks,
              (variantId, delta) =>
                setExtendPicks((current) => changeRentalPick(current, rentals, variantId, delta)),
              (variantId) =>
                setExtendPicks((current) => toggleRentalPick(current, rentals, variantId))
            )}
            {multiRate ? null : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{tr("moreSessionsLabel")}</span>
                <div className="flex items-center rounded bg-slate-800">
                  <button
                    type="button"
                    aria-label={tr("fewerSessions")}
                    className="h-9 w-9 text-lg disabled:opacity-40"
                    disabled={extendCount <= minimumUnits}
                    onClick={() => setExtendCount((count) => Math.max(minimumUnits, count - 1))}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-semibold">{extendCount}</span>
                  <button
                    type="button"
                    aria-label={tr("moreSessions")}
                    className="h-9 w-9 text-lg"
                    onClick={() => setExtendCount((count) => count + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            <p className="text-sm text-slate-300">
              {tr("sessionsSummary", {
                minutes: extendMinutes,
                perSession: unitMinutes,
              })}
              {extendPriced ? ` · ${money(extendCharge)}` : ""}
            </p>
            {extendSaving > 0 ? (
              <p className="text-sm text-emerald-300">
                {tr("promotionDiscount")} −{money(extendSaving)}
              </p>
            ) : null}
            {freeTimeNotes(
              extendFree,
              "rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-sm text-emerald-200"
            )}
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setShowExtend(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                isLoading={isAdding}
                disabled={isSpa ? !bookingTotals.count : !extendPlan.length}
                onClick={() => (atEnd ? void extendOnBill() : requestCard("extend"))}
              >
                {atEnd ? tr("addToBillShort") : tr("extendAndPay")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {refundApproval ? (
        <ManagerApprovalDialog
          title={tr("refundApprovalTitle", {
            item: lineDisplayName(refundApproval[0]) || refundApproval[0].productName || tr("item"),
          })}
          permission="sales:refund:approve"
          confirmLabel={tr("refundApprovalConfirm")}
          onCancel={() => setRefundApproval(null)}
          onApproved={async (token) => {
            await removeLines(refundApproval, token);
            setRefundApproval(null);
          }}
        >
          {tr("refundApprovalBody", {
            amount: money(
              refundApproval
                .filter((line) => !line.compReasonId)
                .reduce(
                  (sum, line) =>
                    sum +
                    Number(line.quantity || 0) * Number(line.unitPrice || 0) -
                    Number(line.lineDiscount || 0),
                  0
                )
            ),
          })}
        </ManagerApprovalDialog>
      ) : null}

      {confirmEnd && session ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-600 bg-slate-950 p-5">
            <h2 className="text-lg font-bold">{tr("endTitle", { room: room?.roomNumber || "" })}</h2>
            <p className="text-sm text-slate-300">
              {tr("endDescription", { amount: money(quote?.paidTotal) })}
            </p>
            {manualTimesFields}
            <label className="block text-sm">
              {tr("tip")}
              <input
                type="number"
                min={0}
                value={tip}
                onChange={(event) => setTip(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
              />
            </label>
            {tipValue > 0 ? (
              <div className="space-y-2">
                <p className="text-sm">{tr("tipPaidWith")}</p>
                <div className="flex flex-wrap gap-2">
                  {tipMethods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      aria-pressed={tipMethod?.id === method.id}
                      onClick={() => setTipMethodId(method.id)}
                      className={`rounded border px-3 py-1.5 text-sm ${
                        tipMethod?.id === method.id
                          ? "border-emerald-500 bg-emerald-500/15"
                          : "border-slate-700"
                      }`}
                    >
                      {method.name}
                    </button>
                  ))}
                </div>
                <p className="text-sm font-semibold">
                  {tr("totalWithTip", { amount: money(Number(quote?.paidTotal || 0) + tipValue) })}
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="col-span-2"
                disabled={isPaying}
                onClick={() => void printCheckBill()}
              >
                {tr("printBill")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
                {t("common.cancel")}
              </Button>
              <Button isLoading={isPaying} onClick={() => void endTreatment()}>
                {tr("endTreatment")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {balanceWarning ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-amber-500/50 bg-slate-950 p-5">
            <h2 className="text-lg font-semibold text-amber-200">{tr("insufficientTitle")}</h2>
            <p className="text-sm text-slate-300">
              {tr("balanceVsTotal", {
                balance: money(balanceWarning.balance),
                total: money(
                  estimateCardCharge({
                    runningTotal: Number(quote?.runningTotal || 0) + pendingDue,
                    discountBps: balanceWarning.discountBpsSnapshot,
                  })
                ),
              })}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={() => setBalanceWarning(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={openTopup}>{tr("topUpCard")}</Button>
              {!quote?.prepaid && card ? (
                <Button
                  variant="secondary"
                  onClick={() => void commitPending(balanceWarning, card, true)}
                >
                  {tr("addAnyway")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showRoomForm ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <form
            className="grid max-h-[calc(100dvh-2rem)] w-full max-w-2xl grid-cols-1 gap-3 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-5 sm:grid-cols-2"
            onSubmit={handleSaveRoom}
          >
            <h2 className="sm:col-span-2 text-lg font-bold">
              {editingRoom ? tr("editRoom") : tr("addRoom")}
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
            {!isSpa ? (
            <label className="text-sm">
              {tr("sessionPriceLabel")}
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={roomForm.sessionPrice}
                onChange={(event) =>
                  setRoomForm((current) => ({ ...current, sessionPrice: event.target.value }))
                }
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
                required
              />
            </label>
            ) : null}
            <p className="sm:col-span-2 text-xs text-slate-400">
              {isSpa
                ? tr("roomNoPriceHint")
                : roomForm.sessionPrice !== ""
                ? tr("priceSummary", {
                    price: money(roomForm.sessionPrice),
                    minutes: roomForm.treatmentMinutes,
                    grace: roomForm.graceMinutes,
                  })
                : tr("priceHint")}
            </p>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              {editingRoom ? (
                <Button
                  variant="destructive"
                  disabled={Boolean(findActiveSpaSession(editingRoom))}
                  onClick={() =>
                    void deleteRoom(editingRoom.id).then(() => setShowRoomForm(false))
                  }
                >
                  {tr("retireRoom")}
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
