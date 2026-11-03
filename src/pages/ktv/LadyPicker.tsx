import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import type { Hostess } from "@/core/domain/entities/Hostess";
import { useRoomText } from "@/core/presentation/hooks/useRoomText";

const ladyName = (hostess: Hostess) => hostess.nickname || hostess.name;

/** Every lady on duty, to say who ordered an item: this room's first, then free, then the rest. */
export function LadyPicker({
  itemName,
  ladies,
  roomNumber,
  onPick,
  onCancel,
}: {
  itemName: string;
  ladies: Hostess[];
  roomNumber?: string;
  onPick: (hostess: Hostess) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const tr = useRoomText("ktv");
  const [search, setSearch] = useState("");

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase();
    const found = ladies
      .filter(
        (hostess) =>
          !term ||
          hostess.name.toLowerCase().includes(term) ||
          (hostess.nickname || "").toLowerCase().includes(term)
      )
      .sort((a, b) => ladyName(a).localeCompare(ladyName(b)));
    const here = (hostess: Hostess) =>
      Boolean(roomNumber) && hostess.inRoom?.roomNumber === roomNumber;
    return [
      { key: "here", title: tr("ladiesInThisRoom"), items: found.filter(here) },
      { key: "free", title: tr("ladiesFree"), items: found.filter((hostess) => !hostess.inRoom) },
      {
        key: "elsewhere",
        title: tr("ladiesInOtherRooms"),
        items: found.filter((hostess) => hostess.inRoom && !here(hostess)),
      },
    ].filter((section) => section.items.length);
  }, [ladies, roomNumber, search, tr]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lady-picker-title"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col gap-4 rounded-lg border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl shadow-black/50"
      >
        <h2 id="lady-picker-title" className="text-lg font-bold">
          {tr("whoOrdered", { item: itemName })}
        </h2>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={tr("searchLady")}
          aria-label={tr("searchLady")}
          className="h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-100 focus:border-blue-500 focus:outline-none"
        />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {!ladies.length ? (
            <p className="text-sm text-slate-400">{tr("noHostesses")}</p>
          ) : !sections.length ? (
            <p className="text-sm text-slate-400">{tr("noLadyMatch")}</p>
          ) : null}
          {sections.map((section) => (
            <section key={section.key} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {section.title}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {section.items.map((hostess) => (
                  <button
                    key={hostess.id}
                    type="button"
                    onClick={() => onPick(hostess)}
                    className="flex min-h-12 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-left hover:border-pink-400"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        hostess.inRoom ? "bg-sky-400" : "bg-emerald-400"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{ladyName(hostess)}</span>
                      {hostess.inRoom && section.key === "elsewhere" ? (
                        <span className="block truncate text-xs text-sky-300">
                          {tr("hostessInRoom", { room: hostess.inRoom.roomNumber })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
