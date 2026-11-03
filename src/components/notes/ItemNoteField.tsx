import { useTranslation } from "react-i18next";
import { ITEM_NOTE_MAX, hasQuickNote, toggleQuickNote } from "@/lib/notes/itemNote";

/**
 * The note for the kitchen or bar on an item: the shop's quick notes to tap, and
 * room to type anything else.
 */
export function ItemNoteField({
  value,
  onChange,
  quickNotes,
}: {
  value: string;
  onChange: (note: string) => void;
  quickNotes: string[];
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4">
      {quickNotes.length ? (
        <fieldset>
          <legend className="text-sm font-semibold">{t("itemNote.quickNotes")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickNotes.map((quick) => {
              const on = hasQuickNote(value, quick);
              return (
                <button
                  key={quick}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(toggleQuickNote(value, quick))}
                  className={[
                    "min-h-10 rounded-full border px-3 text-sm",
                    on ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900",
                  ].join(" ")}
                >
                  {quick}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <label className="mt-3 block text-xs text-slate-300">
        <span className="sr-only">{t("itemNote.label")}</span>
        <textarea
          value={value}
          maxLength={ITEM_NOTE_MAX}
          rows={2}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("itemNote.placeholder")}
          className="w-full resize-none rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>
    </div>
  );
}
