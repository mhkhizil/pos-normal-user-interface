import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/modifiers/OptionGroup";
import { ItemNoteField } from "@/components/notes/ItemNoteField";
import type { ChosenModifier } from "@/core/domain/entities/Cashier";
import type { TabletMenuItem } from "@/core/domain/entities/RoomTablet";
import { chosenModifiers, defaultOptions, missingGroup, toggleOption } from "@/lib/modifiers/choices";
import { cleanNote } from "@/lib/notes/itemNote";
import { unitPriceOf } from "@/lib/tablet/cart";

const money = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** A guest picks an item's options and a note before it goes in the cart. */
export function TabletItemDialog({
  item,
  quickNotes,
  onAdd,
  onClose,
}: {
  item: TabletMenuItem;
  quickNotes: string[];
  onAdd: (choice: { modifiers: ChosenModifier[]; note?: string; quantity: number }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() => defaultOptions(item.modifierGroups));
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const modifiers = chosenModifiers(item.modifierGroups, selected);
  const total = unitPriceOf(item.price, modifiers) * quantity;

  const add = () => {
    const missing = missingGroup(item.modifierGroups, selected);
    if (missing) {
      setError(t("cashier.productMenu.pickFrom", { name: missing.name }));
      return;
    }
    onAdd({ modifiers, note: cleanNote(note), quantity });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-5 text-white"
      >
        <h2 className="text-lg font-bold">
          {item.name} <span className="font-normal text-teal-300">· {money(Number(item.price))}</span>
        </h2>
        {item.modifierGroups.map((group) => (
          <OptionGroup
            key={group.id}
            group={group}
            selected={selected}
            onToggle={(optionId) => {
              setError(null);
              setSelected((current) => toggleOption(current, group, optionId));
            }}
          />
        ))}
        <ItemNoteField value={note} onChange={setNote} quickNotes={quickNotes} />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            aria-label={t("tablet.less")}
            className="h-11 w-11 rounded bg-slate-800 text-lg disabled:opacity-40"
            disabled={quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          >
            −
          </button>
          <span className="w-8 text-center text-lg tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label={t("tablet.more")}
            className="h-11 w-11 rounded bg-slate-800 text-lg"
            onClick={() => setQuantity((value) => value + 1)}
          >
            +
          </button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={add}>{t("tablet.addItem", { amount: money(total) })}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
