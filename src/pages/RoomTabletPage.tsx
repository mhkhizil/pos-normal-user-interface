import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { CardCaptureStatus } from "@/components/ui/CardCaptureStatus";
import {
  TabletMenuItem,
  TabletRoom,
  TabletVisitRoom,
  VisitOrderStatus,
} from "@/core/domain/entities/RoomTablet";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";
import { useRoomTablet } from "@/core/presentation/hooks/useRoomTablet";
import { getKtvWarning } from "@/lib/ktv/session";

type Screen = "idle" | "start" | "home" | "menu" | "time" | "history" | "done";
type PayFor = "start" | "order" | "time";

const SETUP_KEY = "room-tablet-room";
const IDLE_MS = 90000;
const DONE_MS = 5000;

type TabletSetup = { roomId: string; roomNumber: string };

const readSetup = (): TabletSetup | null => {
  try {
    const raw = window.localStorage.getItem(SETUP_KEY);
    return raw ? (JSON.parse(raw) as TabletSetup) : null;
  } catch {
    return null;
  }
};

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const STATUS_TONE: Record<VisitOrderStatus, string> = {
  RECEIVED: "bg-slate-700 text-slate-100",
  PREPARING: "bg-amber-600 text-white",
  READY: "bg-emerald-600 text-white",
  SERVED: "bg-slate-800 text-slate-300",
  REFUNDED: "bg-red-900 text-red-100",
};

export function RoomTabletPage() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const {
    visit,
    menu,
    history,
    rooms,
    isLoading,
    loadVisit,
    refreshVisit,
    loadMenu,
    loadHistory,
    loadRooms,
    startRoom,
    placeOrder,
    addTime,
    clear,
  } = useRoomTablet();
  const [setup, setSetup] = useState<TabletSetup | null>(() => readSetup());
  const [screen, setScreen] = useState<Screen>("idle");
  const [cardUid, setCardUid] = useState("");
  const [typedUid, setTypedUid] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [categoryId, setCategoryId] = useState("");
  const [sessions, setSessions] = useState(1);
  const [payFor, setPayFor] = useState<PayFor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const payKey = useRef<string | null>(null);
  const lastTouch = useRef(Date.now());

  const tabletRoom: TabletRoom | undefined = rooms.find((room) => room.roomId === setup?.roomId);
  const myRoom: TabletVisitRoom | undefined = visit?.rooms.find(
    (room) => room.roomId === setup?.roomId
  );
  const items = useMemo(() => menu.flatMap((category) => category.items), [menu]);
  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([variantId, quantity]) => ({
          item: items.find((entry) => entry.variantId === variantId),
          quantity,
        }))
        .filter((line): line is { item: TabletMenuItem; quantity: number } =>
          Boolean(line.item && line.quantity > 0)
        ),
    [cart, items]
  );
  const cartTotal = cartLines.reduce(
    (sum, line) => sum + Number(line.item.price) * line.quantity,
    0
  );
  const sessionPrice = Number(tabletRoom?.sessionPrice || myRoom?.sessionPrice || 0);
  const sessionMinutes = tabletRoom?.sessionMinutes || myRoom?.sessionMinutes || 60;
  const discount = (visit?.guest.discountPercent || 0) / 100;
  const payAmount =
    payFor === "time"
      ? sessionPrice * sessions * (1 - discount)
      : payFor === "start"
        ? sessionPrice * sessions + cartTotal
        : cartTotal * (1 - discount);

  useEffect(() => {
    if (!setup && !rooms.length) void loadRooms().catch(() => undefined);
  }, [loadRooms, rooms.length, setup]);

  useEffect(() => {
    if (!setup) return;
    const tick = () => {
      if (document.visibilityState === "visible") void loadRooms().catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, [loadRooms, setup]);

  const reset = useCallback(() => {
    clear();
    setCardUid("");
    setTypedUid("");
    setCart({});
    setSessions(1);
    setPayFor(null);
    setError(null);
    setScreen("idle");
  }, [clear]);

  const touch = () => {
    lastTouch.current = Date.now();
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      if (screen !== "idle" && Date.now() - lastTouch.current > IDLE_MS) reset();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [reset, screen]);

  useEffect(() => {
    if (screen !== "home" || !cardUid) return;
    const timer = window.setInterval(() => {
      void refreshVisit(cardUid).catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [cardUid, refreshVisit, screen]);

  useEffect(() => {
    if (screen !== "done") return;
    const timer = window.setTimeout(() => {
      setScreen("home");
      if (cardUid) void refreshVisit(cardUid).catch(() => undefined);
    }, DONE_MS);
    return () => window.clearTimeout(timer);
  }, [cardUid, refreshVisit, screen]);

  const explain = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : "";
    if (/insufficient|balance/i.test(message)) return t("tablet.errors.balance");
    if (/does not belong|another card|not the wallet/i.test(message)) {
      return t("tablet.errors.wrongCard");
    }
    if (/being prepared|not available|already in use/i.test(message)) {
      return t("tablet.errors.roomTaken");
    }
    return message || t("tablet.errors.generic");
  };

  const openMyVisit = async (uid: string) => {
    touch();
    setError(null);
    try {
      const result = await loadVisit(uid);
      if (!result.rooms.some((room) => room.roomId === setup?.roomId)) {
        clear();
        setError(t("tablet.errors.wrongCard"));
        return;
      }
      setCardUid(uid);
      setScreen("home");
    } catch (caught) {
      setError(explain(caught));
    }
  };

  const pay = async (uid: string) => {
    if (!payFor || !setup) return;
    touch();
    setError(null);
    payKey.current ||= newKey();
    const deviceName = `${setup.roomNumber} tablet`;
    try {
      if (payFor === "start") {
        const result = await startRoom({
          cardUid: uid,
          roomId: setup.roomId,
          sessions,
          items: cartLines.map((line) => ({
            variantId: line.item.variantId,
            quantity: line.quantity,
          })),
          idempotencyKey: payKey.current,
          deviceName,
        });
        setDoneMessage(
          t("tablet.started", {
            count: sessions,
            amount: money(result.charged),
            balance: money(result.balanceAfter),
          })
        );
        setCardUid(uid);
        await loadVisit(uid);
      } else if (payFor === "order" && myRoom) {
        const result = await placeOrder({
          cardUid: uid,
          sessionId: myRoom.sessionId,
          items: cartLines.map((line) => ({
            variantId: line.item.variantId,
            quantity: line.quantity,
          })),
          idempotencyKey: payKey.current,
          deviceName,
        });
        setDoneMessage(
          t("tablet.orderSent", {
            number: result.orderNumber ?? "",
            amount: money(result.charged),
            balance: money(result.balanceAfter),
          })
        );
      } else if (payFor === "time" && myRoom) {
        const result = await addTime({
          cardUid: uid,
          sessionId: myRoom.sessionId,
          sessions,
          idempotencyKey: payKey.current,
          deviceName,
        });
        setDoneMessage(
          t("tablet.timeAdded", {
            count: sessions,
            amount: money(result.charged),
            balance: money(result.balanceAfter),
          })
        );
      }
      payKey.current = null;
      setCart({});
      setPayFor(null);
      void loadRooms().catch(() => undefined);
      setScreen("done");
    } catch (caught) {
      setError(explain(caught));
    }
  };

  const onCard = (uid: string) => {
    if (!setup) return;
    if (payFor) void pay(uid);
    else if (screen === "idle" && tabletRoom && !tabletRoom.available) void openMyVisit(uid);
  };

  const listening =
    Boolean(setup) &&
    (Boolean(payFor) || (screen === "idle" && Boolean(tabletRoom) && !tabletRoom?.available));
  const { nfcSupported, nfcActive, nfcError, lastUid, startNfc } = useCardCapture({
    enabled: listening,
    onRead: onCard,
  });

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (typedUid.trim()) onCard(typedUid.trim());
    setTypedUid("");
  };

  const ensureMenu = async () => {
    if (!menu.length) await loadMenu();
  };

  const addToCart = (variantId: string, delta: number) => {
    touch();
    setCart((current) => {
      const next = Math.max(0, (current[variantId] || 0) + delta);
      const copy = { ...current };
      if (next) copy[variantId] = next;
      else delete copy[variantId];
      return copy;
    });
  };

  const exitTablet = () => {
    if (!window.confirm(t("tablet.exitConfirm"))) return;
    try {
      window.localStorage.removeItem(SETUP_KEY);
    } catch {
      // Storage can be blocked; signing out is what matters.
    }
    void logout();
  };

  const chooseRoom = (room: TabletRoom) => {
    const value = { roomId: room.roomId, roomNumber: room.roomNumber };
    try {
      window.localStorage.setItem(SETUP_KEY, JSON.stringify(value));
    } catch {
      // Kept for this visit only when storage is blocked.
    }
    setSetup(value);
  };

  if (!setup) {
    return (
      <main className="min-h-screen bg-[#080808] p-6 text-white">
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold">{t("tablet.setupTitle")}</h1>
          <p className="text-slate-400">{t("tablet.setupDescription")}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {rooms.map((room) => (
              <button
                key={room.roomId}
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-left hover:border-teal-500"
                onClick={() => chooseRoom(room)}
              >
                <p className="text-xl font-bold">{room.roomNumber}</p>
                <p className="text-sm text-slate-400">{room.name}</p>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const allowTyping = !nfcSupported;

  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
      <button
        type="button"
        className="text-left"
        onDoubleClick={exitTablet}
        aria-label={t("tablet.deviceLabel", { name: setup.roomNumber })}
      >
        <p className="text-2xl font-bold">
          {setup.roomNumber}
          {tabletRoom?.name ? (
            <span className="ml-2 text-base font-normal text-slate-400">{tabletRoom.name}</span>
          ) : null}
        </p>
        {tabletRoom?.treatment ? (
          <p className="text-xs text-slate-500">{tabletRoom.treatment}</p>
        ) : null}
      </button>
      {visit ? (
        <div className="text-right">
          <p className="font-semibold">{visit.guest.displayName}</p>
          <p className="text-xs text-slate-400">
            {visit.guest.tier}
            {visit.guest.discountPercent
              ? ` · ${t("tablet.discount", { percent: visit.guest.discountPercent })}`
              : ""}
          </p>
          <p
            className={`text-lg font-bold ${
              Number(visit.guest.balance) < 0 ? "text-amber-300" : "text-emerald-300"
            }`}
          >
            {visit.guest.isPostpaid
              ? t("tablet.tab", { amount: money(visit.guest.balance) })
              : t("tablet.balance", { amount: money(visit.guest.balance) })}
          </p>
        </div>
      ) : null}
    </header>
  );

  const tapPanel = (title: string) => (
    <div className="mx-auto mt-8 w-full max-w-md space-y-5 text-center">
      <div className="mx-auto grid h-28 w-28 place-items-center rounded-full border-4 border-teal-500 text-4xl">
        ((·))
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <CardCaptureStatus
        nfcSupported={nfcSupported}
        nfcActive={nfcActive}
        nfcError={nfcError}
        lastUid={lastUid}
        onEnableNfc={() => void startNfc()}
      />
      {allowTyping ? (
        <form className="flex gap-2" onSubmit={submitTyped}>
          <input
            value={typedUid}
            onChange={(event) => setTypedUid(event.target.value)}
            placeholder={t("tablet.typeCard")}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
          <Button type="submit" isLoading={isLoading}>
            {t("tablet.ok")}
          </Button>
        </form>
      ) : null}
    </div>
  );

  const sessionStepper = (
    <div className="space-y-3 text-center">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label={t("tablet.less")}
          className="h-14 w-14 rounded-full bg-slate-800 text-2xl disabled:opacity-40"
          disabled={sessions <= 1}
          onClick={() => setSessions((count) => Math.max(1, count - 1))}
        >
          −
        </button>
        <span className="w-16 text-4xl font-bold">{sessions}</span>
        <button
          type="button"
          aria-label={t("tablet.more")}
          className="h-14 w-14 rounded-full bg-slate-800 text-2xl"
          onClick={() => setSessions((count) => count + 1)}
        >
          +
        </button>
      </div>
      <p className="text-slate-300">
        {t("tablet.sessionsOf", { count: sessions, minutes: sessions * sessionMinutes })}
      </p>
      {sessionPrice ? (
        <p className="text-xl font-bold text-teal-300">{money(sessionPrice * sessions)}</p>
      ) : null}
    </div>
  );

  const menuGrid = (
    <div className="min-h-0 space-y-3 overflow-y-auto">
      <div className="flex flex-wrap gap-2">
        {menu.map((category) => (
          <button
            key={category.categoryId}
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              (categoryId || menu[0]?.categoryId) === category.categoryId
                ? "bg-teal-600"
                : "bg-slate-800"
            }`}
            onClick={() => setCategoryId(category.categoryId)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {(menu.find((c) => c.categoryId === (categoryId || menu[0]?.categoryId))?.items || []).map(
          (item) => (
            <button
              key={item.variantId}
              type="button"
              className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-left"
              onClick={() => addToCart(item.variantId, 1)}
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="h-24 w-full object-cover" />
              ) : (
                <span className="flex h-24 items-center justify-center bg-slate-800 text-2xl text-slate-500">
                  {item.name.slice(0, 1)}
                </span>
              )}
              <span className="block p-3">
                <span className="block font-semibold">{item.name}</span>
                <span className="text-teal-300">{money(item.price)}</span>
                {cart[item.variantId] ? (
                  <span className="float-right rounded bg-teal-700 px-2 text-sm">
                    × {cart[item.variantId]}
                  </span>
                ) : null}
              </span>
            </button>
          )
        )}
      </div>
    </div>
  );

  const cartList = cartLines.map((line) => (
    <div key={line.item.variantId} className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{line.item.name}</span>
      <button
        type="button"
        aria-label={t("tablet.less")}
        className="h-8 w-8 rounded bg-slate-800"
        onClick={() => addToCart(line.item.variantId, -1)}
      >
        −
      </button>
      <span className="w-6 text-center">{line.quantity}</span>
      <button
        type="button"
        aria-label={t("tablet.more")}
        className="h-8 w-8 rounded bg-slate-800"
        onClick={() => addToCart(line.item.variantId, 1)}
      >
        +
      </button>
      <span className="w-16 text-right">{money(Number(line.item.price) * line.quantity)}</span>
    </div>
  ));

  return (
    <main
      className="flex min-h-screen flex-col bg-[#080808] text-white"
      onPointerDown={touch}
      onKeyDown={touch}
    >
      {header}

      {error ? (
        <p className="mx-6 mt-4 rounded border border-red-500/60 bg-red-950/50 p-3 text-center text-red-100">
          {error}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col p-6">
        {payFor ? (
          <>
            {tapPanel(t("tablet.tapToPay", { amount: money(payAmount) }))}
            <p className="mt-3 text-center text-xs text-slate-500">{t("tablet.discountNote")}</p>
            <div className="mx-auto mt-6 w-full max-w-md">
              <Button fullWidth variant="secondary" onClick={() => setPayFor(null)}>
                {t("tablet.cancel")}
              </Button>
            </div>
          </>
        ) : screen === "idle" ? (
          !tabletRoom ? null : tabletRoom.available ? (
            <div className="mx-auto mt-10 max-w-md space-y-6 text-center">
              <p className="text-sm uppercase tracking-wide text-emerald-300">
                {t("tablet.roomFree")}
              </p>
              <p className="text-3xl font-bold">{t("tablet.welcome")}</p>
              {tabletRoom.sessionPrice ? (
                <p className="text-slate-300">
                  {t("tablet.pricePerSession", {
                    minutes: tabletRoom.sessionMinutes,
                    amount: money(tabletRoom.sessionPrice),
                  })}
                </p>
              ) : null}
              <Button
                fullWidth
                onClick={() => {
                  touch();
                  setError(null);
                  setSessions(1);
                  setCart({});
                  void ensureMenu();
                  setScreen("start");
                }}
              >
                {t("tablet.startTreatment")}
              </Button>
            </div>
          ) : tabletRoom.status === "IN_USE" ? (
            <>
              {tabletRoom.endsAt ? (
                <p className="text-center text-xl font-semibold text-slate-300">
                  {getKtvWarning(tabletRoom.endsAt, nowMs).level === "EXPIRED"
                    ? t("tablet.timeUp")
                    : t("tablet.minutesLeft", {
                        count: getKtvWarning(tabletRoom.endsAt, nowMs).remainingMinutes,
                      })}
                </p>
              ) : null}
              {tapPanel(t("tablet.tapToContinue"))}
            </>
          ) : (
            <p className="mt-16 text-center text-2xl text-slate-300">
              {t("tablet.roomPreparing")}
            </p>
          )
        ) : screen === "start" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
              <div>
                <h2 className="mb-3 text-xl font-bold">{t("tablet.howLong")}</h2>
                {sessionStepper}
              </div>
              <div>
                <h2 className="mb-3 text-xl font-bold">{t("tablet.addFood")}</h2>
                {menuGrid}
              </div>
            </div>
            <aside className="flex flex-col gap-3 rounded-lg border border-slate-800 p-4">
              <p className="font-bold">{t("tablet.review")}</p>
              <p className="flex justify-between text-sm">
                <span>
                  {t("tablet.sessionsOf", { count: sessions, minutes: sessions * sessionMinutes })}
                </span>
                <span>{money(sessionPrice * sessions)}</span>
              </p>
              {cartList}
              <p className="mt-auto flex justify-between border-t border-slate-800 pt-2 font-bold">
                <span>{t("tablet.total")}</span>
                <span>{money(sessionPrice * sessions + cartTotal)}</span>
              </p>
              <p className="text-xs text-slate-500">{t("tablet.discountNote")}</p>
              <Button onClick={() => setPayFor("start")}>
                {t("tablet.payAndStart", { amount: money(sessionPrice * sessions + cartTotal) })}
              </Button>
              <Button variant="secondary" onClick={reset}>
                {t("tablet.cancel")}
              </Button>
            </aside>
          </div>
        ) : screen === "done" ? (
          <div className="mx-auto mt-16 max-w-md space-y-4 text-center">
            <p className="text-6xl text-emerald-400">✓</p>
            <p className="text-2xl font-bold">{doneMessage}</p>
            <Button onClick={() => setScreen("home")}>{t("tablet.backToVisit")}</Button>
          </div>
        ) : !visit || !myRoom ? null : screen === "home" ? (
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <RoomCard room={myRoom} nowMs={nowMs} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button
                onClick={() => {
                  setCart({});
                  void ensureMenu();
                  setScreen("menu");
                }}
              >
                {t("tablet.orderFood")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSessions(1);
                  setScreen("time");
                }}
              >
                {t("tablet.addTime")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void loadHistory(cardUid);
                  setScreen("history");
                }}
              >
                {t("tablet.cardHistory")}
              </Button>
            </div>
            <Button fullWidth variant="secondary" onClick={reset}>
              {t("tablet.done")}
            </Button>
          </div>
        ) : screen === "menu" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            {menuGrid}
            <aside className="flex flex-col gap-3 rounded-lg border border-slate-800 p-4">
              <p className="font-bold">{t("tablet.yourOrder")}</p>
              {cartLines.length === 0 ? (
                <p className="text-sm text-slate-500">{t("tablet.cartEmpty")}</p>
              ) : (
                cartList
              )}
              <p className="mt-auto flex justify-between border-t border-slate-800 pt-2 font-bold">
                <span>{t("tablet.total")}</span>
                <span>{money(cartTotal)}</span>
              </p>
              <Button disabled={!cartLines.length} onClick={() => setPayFor("order")}>
                {t("tablet.payAndOrder", { amount: money(cartTotal * (1 - discount)) })}
              </Button>
              <Button variant="secondary" onClick={() => setScreen("home")}>
                {t("tablet.back")}
              </Button>
            </aside>
          </div>
        ) : screen === "time" ? (
          <div className="mx-auto mt-6 w-full max-w-md space-y-5 text-center">
            <h2 className="text-2xl font-bold">{t("tablet.addTimeTitle", { room: myRoom.roomNumber })}</h2>
            {sessionStepper}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setScreen("home")}>
                {t("tablet.back")}
              </Button>
              <Button onClick={() => setPayFor("time")}>{t("tablet.payTime")}</Button>
            </div>
          </div>
        ) : screen === "history" ? (
          <div className="mx-auto w-full max-w-2xl space-y-2">
            <h2 className="text-xl font-bold">{t("tablet.cardHistory")}</h2>
            {history.length === 0 ? (
              <p className="text-slate-400">{t("tablet.noHistory")}</p>
            ) : (
              history.map((entry, index) => (
                <div
                  key={`${entry.at}-${index}`}
                  className="flex items-center justify-between rounded border border-slate-800 p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {t(`tablet.entry.${entry.type}`, { defaultValue: entry.type })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(entry.at).toLocaleString()} {entry.note ? `· ${entry.note}` : ""}
                    </p>
                  </div>
                  <span
                    className={`font-semibold ${
                      Number(entry.amount) < 0 ? "text-slate-200" : "text-emerald-300"
                    }`}
                  >
                    {Number(entry.amount) > 0 ? "+" : ""}
                    {money(entry.amount)}
                  </span>
                </div>
              ))
            )}
            <Button fullWidth variant="secondary" onClick={() => setScreen("home")}>
              {t("tablet.back")}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function RoomCard({ room, nowMs }: { room: TabletVisitRoom; nowMs: number }) {
  const { t } = useTranslation();
  const warning = getKtvWarning(room.endsAt, nowMs);
  const started = new Date(room.openedAt).getTime();
  const ends = room.endsAt ? new Date(room.endsAt).getTime() : null;
  const progress =
    ends && ends > started
      ? Math.min(100, Math.max(0, ((nowMs - started) / (ends - started)) * 100))
      : 0;
  const itemOrders = room.orders.filter((order) => order.kind === "ITEMS");
  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">
          {t("tablet.startedAt", {
            time: new Date(room.openedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
          {room.plannedMinutes ? ` · ${t("tablet.booked", { minutes: room.plannedMinutes })}` : ""}
        </p>
        {room.endsAt ? (
          <p
            className={`text-right text-xl font-bold ${
              warning.level === "EXPIRED"
                ? "text-red-300"
                : warning.level === "WARNING"
                  ? "text-orange-300"
                  : "text-white"
            }`}
          >
            {warning.level === "EXPIRED"
              ? t("tablet.timeUp")
              : t("tablet.minutesLeft", { count: warning.remainingMinutes })}
          </p>
        ) : null}
      </div>
      {ends ? (
        <div className="h-2 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-teal-500" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-300">{t("tablet.myOrders")}</p>
        {itemOrders.length === 0 ? (
          <p className="text-sm text-slate-500">{t("tablet.noOrders")}</p>
        ) : (
          itemOrders.map((order) => (
            <div key={order.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                #{order.orderNumber}{" "}
                {order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ")}
              </span>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[order.status]}`}
              >
                {t(`tablet.status.${order.status}`)}
              </span>
            </div>
          ))
        )}
      </div>
      <p className="flex justify-between border-t border-slate-800 pt-2 text-sm">
        <span className="text-slate-400">{t("tablet.spent")}</span>
        <span className="font-semibold">{money(room.spent)}</span>
      </p>
    </div>
  );
}
