export const ITEM_NOTE_MAX = 200;

const parts = (note: string) =>
  note
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Whether a quick note is already in the note. */
export const hasQuickNote = (note: string, quick: string) =>
  parts(note).some((part) => same(part, quick));

/** Tapping a quick note: it comes out if it is in the note, else it goes on the end. */
export const toggleQuickNote = (note: string, quick: string) => {
  const current = parts(note);
  const next = current.some((part) => same(part, quick))
    ? current.filter((part) => !same(part, quick))
    : [...current, quick];
  return next.join(", ").slice(0, ITEM_NOTE_MAX);
};

/** The note as it is saved: trimmed, and nothing when blank. */
export const cleanNote = (note?: string | null) => note?.trim() || undefined;
