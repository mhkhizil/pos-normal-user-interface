import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { CardCaptureStatus } from "@/components/ui/CardCaptureStatus";
import {
  TabletMenuItem,
  TabletVisitRoom,
  VisitOrderStatus,
} from "@/core/domain/entities/RoomTablet";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";
import { useRoomTablet } from "@/core/presentation/hooks/useRoomTablet";
import { getKtvWarning } from "@/lib/ktv/session";

type Screen = "idle" | "home" | "menu" | "time" | "history" | "done";
type PayFor = { kind: "order" } | { kind: "time"; sessions: number };

const SETUP_KEY = "room-tablet-setup";
const IDLE_MS = 60000;
const DONE_MS = 5000;

type TabletSetup = { deviceName: string; allowTyping: boolean };

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
    isLoading,
    loadVisit,
    refreshVisit,
    loadMenu,
    loadHistory,
    placeOrder,
    addTime,
    clear,
  } = useRoomTablet();
  const [setup, setSetup] = useState<TabletSetup | null>(() => readSetup());
  const [setupForm, setSetupForm] = useState<TabletSetup>({
    deviceName: "",
    allowTyping: false,
  });
  const [screen, setScreen] = useState<Screen>("idle");
  const [cardUid, setCardUid] = useState("");
  const [typedUid, setTypedUid] = useState("");
  const [roomId, setRoomId] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [categoryId, setCategoryId] = useState("");
  const [extraSessions, setExtraSessions] = useState(1);
  const [payFor, setPayFor] = useState<PayFor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const payKey = useRef<string | null>(null);
  const lastTouch = useRef(Date.now());

  const room: TabletVisitRoom | undefined =
    visit?.rooms.find((item) => item.sessionId === roomId) || visit?.rooms[0];
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
  const discount = (visit?.guest.discountPercent || 0) / 100;
  const payAmount =
    payFor?.kind === "time"
      ? Number(room?.sessionPrice || 0) * payFor.sessions * (1 - discount)
      : cartTotal * (1 - discount);

  const reset = useCallback(() => {
    clear();
    setCardUid("");
    setTypedUid("");
    setRoomId("");
    setCart({});
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
    return message || t("tablet.errors.generic");
  };

  const startVisit = async (uid: string) => {
    touch();
    setError(null);
    try {
      const result = await loadVisit(uid);
      setCardUid(uid);
      setRoomId(result.rooms[0]?.sessionId || "");
      setScreen("home");
    } catch (caught) {
      setError(explain(caught));
    }
  };

  const pay = async (uid: string) => {
    if (!room || !payFor || !setup) return;
    touch();
    setError(null);
    payKey.current ||= newKey();
    try {
      const result =
        payFor.kind === "order"
          ? await placeOrder({
              cardUid: uid,
              sessionId: room.sessionId,
              items: cartLines.map((line) => ({
                variantId: line.item.variantId,
                quantity: line.quantity,
              })),
              idempotencyKey: payKey.current,
              deviceName: setup.deviceName,
            })
          : await addTime({
              cardUid: uid,
              sessionId: room.sessionId,
              sessions: payFor.sessions,
              idempotencyKey: payKey.current,
              deviceName: setup.deviceName,
            });
      payKey.current = null;
      setDoneMessage(
        payFor.kind === "order"
          ? t("tablet.orderSent", {
              number: result.orderNumber ?? "",
              amount: money(result.charged),
              balance: money(result.balanceAfter),
            })
          : t("tablet.timeAdded", {
              count: payFor.sessions,
              amount: money(result.charged),
              balance: money(result.balanceAfter),
            })
      );
      if (payFor.kind === "order") setCart({});
      setPayFor(null);
      setScreen("done");
    } catch (caught) {
      setError(explain(caught));
    }
  };

  const onCard = (uid: string) => {
    if (!setup) return;
    if (payFor) void pay(uid);
    else if (screen === "idle") void startVisit(uid);
  };

  const { nfcSupported, nfcActive, nfcError, lastUid, startNfc } = useCardCapture({
    enabled: Boolean(setup) && (screen === "idle" || Boolean(payFor)),
    onRead: onCard,
  });

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (typedUid.trim()) onCard(typedUid.trim());
    setTypedUid("");
  };

  const openMenu = async () => {
    touch();
    setError(null);
    if (!menu.length) await loadMenu();
    setScreen("menu");
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
    if (window.confirm(t("tablet.exitConfirm"))) {
      try {
        window.localStorage.removeItem(SETUP_KEY);
      } catch {
        // Storage can be blocked; signing out is what matters.
      }
      void logout();
    }
  };

  if (!setup) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#080808] p-6 text-white">
        <form
          className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-950 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!setupForm.deviceName.trim()) return;
            const value = { ...setupForm, deviceName: setupForm.deviceName.trim() };
            try {
              window.localStorage.setItem(SETUP_KEY, JSON.stringify(value));
            } catch {
              // Kept for this visit only when storage is blocked.
            }
            setSetup(value);
          }}
        >
          <h1 className="text-2xl font-bold">{t("tablet.setupTitle")}</h1>
          <p className="text-sm text-slate-400">{t("tablet.setupDescription")}</p>
          <label className="block text-sm">
            {t("tablet.deviceName")}
            <input
              value={setupForm.deviceName}
              onChange={(event) =>
                setSetupForm((current) => ({ ...current, deviceName: event.target.value }))
              }
              placeholder={t("tablet.deviceNamePlaceholder")}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-3"
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={setupForm.allowTyping}
              onChange={(event) =>
                setSetupForm((current) => ({ ...current, allowTyping: event.target.checked }))
              }
            />
            {t("tablet.allowTyping")}
          </label>
          <Button fullWidth type="submit">
            {t("tablet.startTablet")}
          </Button>
        </form>
      </main>
    );
  }

  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
      <button
        type="button"
        className="text-left"
        onDoubleClick={exitTablet}
        aria-label={t("tablet.deviceLabel", { name: setup.deviceName })}
      >
        <p className="text-lg font-bold">{t("tablet.brand")}</p>
        <p className="text-xs text-slate-500">{setup.deviceName}</p>
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
    <div className="mx-auto mt-10 w-full max-w-md space-y-5 text-center">
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
      {setup.allowTyping ? (
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
          tapPanel(t("tablet.tapToStart"))
        ) : screen === "done" ? (
          <div className="mx-auto mt-16 max-w-md space-y-4 text-center">
            <p className="text-6xl text-emerald-400">✓</p>
            <p className="text-2xl font-bold">{doneMessage}</p>
            <Button onClick={() => setScreen("home")}>{t("tablet.backToVisit")}</Button>
          </div>
        ) : !visit ? null : screen === "home" ? (
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {visit.rooms.length === 0 ? (
              <p className="mt-10 text-center text-lg text-slate-300">{t("tablet.noRoom")}</p>
            ) : (
              <>
                {visit.rooms.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {visit.rooms.map((item) => (
                      <button
                        key={item.sessionId}
                        type="button"
                        className={`rounded-full px-4 py-2 font-semibold ${
                          item.sessionId === room?.sessionId ? "bg-teal-600" : "bg-slate-800"
                        }`}
                        onClick={() => setRoomId(item.sessionId)}
                      >
                        {item.roomNumber}
                      </button>
                    ))}
                  </div>
                ) : null}
                {room ? (
                  <RoomCard room={room} nowMs={nowMs} />
                ) : null}
                {room && !room.prepaid ? (
                  <p className="rounded border border-amber-500/60 bg-amber-950/40 p-3 text-sm text-amber-100">
                    {t("tablet.orderAtReception")}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Button disabled={!room?.prepaid} onClick={() => void openMenu()}>
                    {t("tablet.orderFood")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!room?.prepaid}
                    onClick={() => {
                      setExtraSessions(1);
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
              </>
            )}
            <Button fullWidth variant="secondary" onClick={reset}>
              {t("tablet.done")}
            </Button>
          </div>
        ) : screen === "menu" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
            <aside className="flex flex-col gap-3 rounded-lg border border-slate-800 p-4">
              <p className="font-bold">{t("tablet.yourOrder")}</p>
              {cartLines.length === 0 ? (
                <p className="text-sm text-slate-500">{t("tablet.cartEmpty")}</p>
              ) : (
                cartLines.map((line) => (
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
                    <span className="w-16 text-right">
                      {money(Number(line.item.price) * line.quantity)}
                    </span>
                  </div>
                ))
              )}
              <p className="mt-auto flex justify-between border-t border-slate-800 pt-2 font-bold">
                <span>{t("tablet.total")}</span>
                <span>{money(cartTotal)}</span>
              </p>
              <Button
                disabled={!cartLines.length}
                onClick={() => {
                  setError(null);
                  setPayFor({ kind: "order" });
                }}
              >
                {t("tablet.payAndOrder", { amount: money(cartTotal * (1 - discount)) })}
              </Button>
              <Button variant="secondary" onClick={() => setScreen("home")}>
                {t("tablet.back")}
              </Button>
            </aside>
          </div>
        ) : screen === "time" && room ? (
          <div className="mx-auto mt-6 w-full max-w-md space-y-5 text-center">
            <h2 className="text-2xl font-bold">{t("tablet.addTimeTitle", { room: room.roomNumber })}</h2>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label={t("tablet.less")}
                className="h-14 w-14 rounded-full bg-slate-800 text-2xl disabled:opacity-40"
                disabled={extraSessions <= 1}
                onClick={() => setExtraSessions((count) => Math.max(1, count - 1))}
              >
                −
              </button>
              <span className="w-16 text-4xl font-bold">{extraSessions}</span>
              <button
                type="button"
                aria-label={t("tablet.more")}
                className="h-14 w-14 rounded-full bg-slate-800 text-2xl"
                onClick={() => setExtraSessions((count) => count + 1)}
              >
                +
              </button>
            </div>
            <p className="text-slate-300">
              {t("tablet.sessionsOf", {
                count: extraSessions,
                minutes: extraSessions * room.sessionMinutes,
              })}
            </p>
            {room.sessionPrice ? (
              <p className="text-xl font-bold text-teal-300">
                {money(Number(room.sessionPrice) * extraSessions * (1 - discount))}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setScreen("home")}>
                {t("tablet.back")}
              </Button>
              <Button onClick={() => setPayFor({ kind: "time", sessions: extraSessions })}>
                {t("tablet.payTime")}
              </Button>
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
  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-teal-300">{t("tablet.spa")}</p>
          <p className="text-2xl font-bold">
            {room.roomNumber}
            {room.roomName ? (
              <span className="ml-2 text-base font-normal text-slate-400">{room.roomName}</span>
            ) : null}
          </p>
          <p className="text-sm text-slate-400">
            {t("tablet.startedAt", {
              time: new Date(room.openedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
            {room.plannedMinutes ? ` · ${t("tablet.booked", { minutes: room.plannedMinutes })}` : ""}
          </p>
        </div>
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
        {room.orders.filter((order) => order.kind === "ITEMS").length === 0 ? (
          <p className="text-sm text-slate-500">{t("tablet.noOrders")}</p>
        ) : (
          room.orders
            .filter((order) => order.kind === "ITEMS")
            .map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  #{order.orderNumber}{" "}
                  {order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ")}
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[order.status]}`}>
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
