import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { formatPosMoney } from "@/lib/pos/orderListDisplay";
import type { Hostess } from "@/core/domain/entities/Hostess";
import { LadyPicker } from "../ktv/LadyPicker";
import { ItemNoteField } from "@/components/notes/ItemNoteField";
import { cleanNote } from "@/lib/notes/itemNote";

export interface LineEdit {
  /** How many of the item the price and FOC are for; the rest stay as they are. */
  quantity: number;
  unitPrice: number;
  foc: boolean;
  /** Who ordered it: a hostess's id, or null for the customer. Left out when not asked. */
  orderedBy?: string | null;
  /** The note for the kitchen or bar; null clears it. Left out when not asked. */
  note?: string | null;
}

interface LineEditDialogProps {
  name: string;
  variant?: string;
  options?: string;
  promo?: string;
  quantity: number;
  unitPrice: number;
  menuPrice?: number;
  isFoc: boolean;
  /** An extra fee keeps the amount it was added with. */
  isFee?: boolean;
  /** Hostesses who may have ordered it; none hides the choice. */
  orderers?: { id: string; name: string }[];
  /** KTV: every lady on duty, so one not with this room can be named too. */
  allLadies?: Hostess[];
  roomNumber?: string;
  orderedBy?: string;
  note?: string;
  /** The shop's quick notes; left out, the dialog does not ask for a note. */
  quickNotes?: string[];
  /** Room time and packages stay on the bill; only their price and FOC change. */
  canRemove?: boolean;
  isBusy?: boolean;
  onSave: (edit: LineEdit) => void;
  onRemove: () => void;
  onClose: () => void;
}

const inputClass =
  "h-11 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none";

/** The details of one item on the bill: its price on this bill, FOC, or taking it off. */
export function LineEditDialog({
  name,
  variant,
  options,
  promo,
  quantity,
  unitPrice,
  menuPrice,
  isFoc,
  isFee = false,
  orderers,
  allLadies,
  roomNumber,
  orderedBy,
  note,
  quickNotes,
  canRemove = true,
  isBusy = false,
  onSave,
  onRemove,
  onClose,
}: LineEditDialogProps) {
  const { t } = useTranslation();
  const [price, setPrice] = useState(String(unitPrice));
  const [foc, setFoc] = useState(isFoc);
  const [orderer, setOrderer] = useState<string | null>(orderedBy ?? null);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [pickingLady, setPickingLady] = useState(false);
  const canOrder = Boolean(orderers?.length || allLadies);
  const ordererOptions = (() => {
    const options = [...(orderers || [])];
    const extra = (id: string | null | undefined, name?: string) => {
      if (id && !options.some((option) => option.id === id)) options.push({ id, name: name || id });
    };
    const ladyName = (id: string | null | undefined) => {
      const lady = allLadies?.find((entry) => entry.id === id);
      return lady ? lady.nickname || lady.name : undefined;
    };
    extra(orderedBy, ladyName(orderedBy) || t("spa.aHostess"));
    extra(picked?.id, picked?.name);
    return options;
  })();
  const [noteText, setNoteText] = useState(note ?? "");
  // Part of an item can be priced on its own only in whole units.
  const canSplit = quantity > 1 && Number.isInteger(quantity);
  const [count, setCount] = useState(quantity);
  const [error, setError] = useState<string | null>(null);
  const value = Number(price);
  const valid = price.trim() !== "" && Number.isFinite(value) && value >= 0;
  const shownPrice = valid ? value : unitPrice;
  const total = foc ? 0 : count * shownPrice;
  const countLabel = Number.isInteger(count) ? String(count) : count.toFixed(2);
  const rest = quantity - count;

  const save = () => {
    if (!valid) {
      setError(t("cashier.lineEdit.priceRequired"));
      return;
    }
    onSave({
      quantity: count,
      unitPrice: value,
      foc,
      ...(canOrder ? { orderedBy: orderer } : {}),
      ...(quickNotes && cleanNote(noteText) !== cleanNote(note)
        ? { note: cleanNote(noteText) ?? null }
        : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-edit-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-5 text-slate-100"
      >
        <div>
          <h2 id="line-edit-title" className="text-lg font-bold">
            {t("cashier.lineEdit.title")}
          </h2>
          <p className="mt-1 break-words text-sm font-medium">
            {name}
            {variant && variant !== name ? (
              <span className="text-slate-400"> · {variant}</span>
            ) : null}
          </p>
          {options ? <p className="mt-0.5 text-xs text-slate-400">{options}</p> : null}
          {promo ? <p className="mt-0.5 text-xs font-medium text-emerald-400">{promo}</p> : null}
        </div>

        {canSplit ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-300">{t("cashier.lineEdit.howMany")}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="h-9 w-9 rounded-md border border-slate-700 bg-slate-900 text-lg disabled:opacity-40"
                aria-label={t("cashier.orderPanel.decreaseQuantity")}
                disabled={count <= 1}
                onClick={() => setCount((value) => Math.max(1, value - 1))}
              >
                −
              </button>
              <span
                className="w-8 text-center font-semibold tabular-nums"
                aria-label={t("cashier.lineEdit.howMany")}
              >
                {count}
              </span>
              <button
                type="button"
                className="h-9 w-9 rounded-md border border-slate-700 bg-slate-900 text-lg disabled:opacity-40"
                aria-label={t("cashier.orderPanel.increaseQuantity")}
                disabled={count >= quantity}
                onClick={() => setCount((value) => Math.min(quantity, value + 1))}
              >
                +
              </button>
              <span className="ml-1 text-slate-400">
                {t("cashier.lineEdit.ofTotal", { count: quantity })}
              </span>
            </div>
          </div>
        ) : null}

        {isFee ? null : (
          <div className="space-y-1 text-sm">
            <label htmlFor="line-edit-price" className="block text-slate-300">
              {t("cashier.lineEdit.price")}
            </label>
            <div className="flex gap-2">
              <input
                id="line-edit-price"
                className={inputClass}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={price}
                disabled={foc}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setError(null);
                }}
              />
              {menuPrice !== undefined && Math.abs(menuPrice - shownPrice) >= 0.0001 ? (
                <button
                  type="button"
                  className="h-11 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-medium hover:border-blue-500 disabled:opacity-40"
                  disabled={foc}
                  onClick={() => {
                    setPrice(String(menuPrice));
                    setError(null);
                  }}
                >
                  {t("cashier.lineEdit.menuPrice", { amount: formatPosMoney(menuPrice) })}
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">{t("cashier.lineEdit.priceHint")}</p>
          </div>
        )}

        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 text-sm">
          <span>{t("cashier.lineEdit.foc")}</span>
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={foc}
            onChange={(event) => setFoc(event.target.checked)}
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-11 shrink-0 rounded-full bg-slate-700 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-blue-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 motion-reduce:after:transition-none"
          />
        </label>

        {canOrder ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">{t("cashier.lineEdit.orderedBy")}</p>
            <div className="flex flex-wrap gap-2">
              {[{ id: null, name: t("cashier.lineEdit.customer") }, ...ordererOptions].map((option) => (
                <button
                  key={option.id ?? "customer"}
                  type="button"
                  aria-pressed={orderer === option.id}
                  onClick={() => setOrderer(option.id)}
                  className={`min-h-11 rounded-md border px-3 text-sm ${
                    orderer === option.id
                      ? "border-pink-400 bg-pink-500/20 text-pink-100"
                      : "border-slate-700 text-slate-300"
                  }`}
                >
                  {option.name}
                </button>
              ))}
              {allLadies ? (
                <button
                  type="button"
                  onClick={() => setPickingLady(true)}
                  className="min-h-11 rounded-md border border-dashed border-slate-600 px-3 text-sm text-slate-300"
                >
                  {t("ktvPos.allLadies")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {quickNotes ? (
          <ItemNoteField value={noteText} onChange={setNoteText} quickNotes={quickNotes} />
        ) : null}

        <div className="space-y-1 border-t border-slate-800 pt-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="tabular-nums text-slate-400">
              {countLabel} × {formatPosMoney(shownPrice)}
              {foc ? ` · ${t("cashier.orderPanel.foc")}` : ""}
            </span>
            <span className="text-base font-semibold tabular-nums">{formatPosMoney(total)}</span>
          </div>
          {rest > 0 ? (
            <p className="text-xs tabular-nums text-slate-500">
              {t("cashier.lineEdit.restStay", {
                count: rest,
                price: formatPosMoney(unitPrice),
              })}
            </p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" fullWidth disabled={isBusy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button fullWidth isLoading={isBusy} onClick={save}>
            {t("cashier.lineEdit.save")}
          </Button>
        </div>

        {canRemove ? (
          <button
            type="button"
            className="mx-auto block min-h-11 rounded px-3 text-sm font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-40"
            disabled={isBusy}
            onClick={onRemove}
          >
            {t("cashier.lineEdit.remove")}
          </button>
        ) : null}
      </div>
      {pickingLady && allLadies ? (
        <LadyPicker
          itemName={name}
          ladies={allLadies}
          roomNumber={roomNumber}
          onPick={(hostess) => {
            setPicked({ id: hostess.id, name: hostess.nickname || hostess.name });
            setOrderer(hostess.id);
            setPickingLady(false);
          }}
          onCancel={() => setPickingLady(false)}
        />
      ) : null}
    </div>
  );
}
