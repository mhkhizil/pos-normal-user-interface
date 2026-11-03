import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { cleanNote } from "@/lib/notes/itemNote";
import { ItemNoteField } from "./ItemNoteField";

/** Writes or changes the note on an item not yet sent to the kitchen. */
export function ItemNoteDialog({
  name,
  note,
  quickNotes,
  onSave,
  onClose,
}: {
  name: string;
  note?: string;
  quickNotes: string[];
  onSave: (note?: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(note ?? "");
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("itemNote.title", { name })}
        className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 p-4 text-white"
      >
        <h2 className="text-base font-semibold">{t("itemNote.title", { name })}</h2>
        <ItemNoteField value={text} onChange={setText} quickNotes={quickNotes} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSave(cleanNote(text))}>{t("itemNote.save")}</Button>
        </div>
      </div>
    </div>
  );
}
