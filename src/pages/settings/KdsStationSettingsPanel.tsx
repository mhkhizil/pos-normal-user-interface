import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCategoryManagement } from "@/core/presentation/hooks/useCategoryManagement";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { useKitchenPrinterManagement } from "@/core/presentation/hooks/useKitchenPrinterManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500";

type Draft = {
  id: string;
  name: string;
  displayColor: string;
  printerIds: string[];
  categoryIds: string[];
};

const emptyDraft = (): Draft => ({
  id: "",
  name: "",
  displayColor: "#2563eb",
  printerIds: [],
  categoryIds: [],
});

export function KdsStationSettingsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeLocationId } = usePosWorkspace();
  const { categories, listCategories } = useCategoryManagement();
  const { printers, listPrinters } = useKitchenPrinterManagement();
  const {
    stations,
    isLoading,
    error,
    listStations,
    createStation,
    updateStation,
    deleteStation,
  } = useKdsStationManagement();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void listCategories({ page: 1, limit: 100, sortBy: "name", sortOrder: "asc" }).catch(
      () => undefined
    );
  }, [listCategories]);

  useEffect(() => {
    void listPrinters({
      page: 1,
      limit: 100,
      locationId: activeLocationId || undefined,
    }).catch(() => undefined);
  }, [activeLocationId, listPrinters]);

  useEffect(() => {
    if (!activeLocationId) return;
    void listStations({
      page: 1,
      limit: 50,
      locationId: activeLocationId,
      sortBy: "name",
      sortOrder: "asc",
    }).catch(() => undefined);
  }, [activeLocationId, listStations]);

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const otherStations = useMemo(() => {
    const owners = new Map<string, string[]>();
    for (const station of stations) {
      if (station.id === draft.id) continue;
      for (const categoryId of station.routingRules.categoryIds) {
        owners.set(categoryId, [...(owners.get(categoryId) ?? []), station.name]);
      }
    }
    return owners;
  }, [draft.id, stations]);

  const kdsPrinters = useMemo(
    () =>
      printers.filter(
        (printer) =>
          printer.sectors?.includes("KDS") || draft.printerIds.includes(printer.id)
      ),
    [draft.printerIds, printers]
  );

  const toggleCategory = (categoryId: string) => {
    setDraft((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId],
    }));
  };

  const togglePrinter = (printerId: string) => {
    setDraft((current) => ({
      ...current,
      printerIds: current.printerIds.includes(printerId)
        ? current.printerIds.filter((id) => id !== printerId)
        : [...current.printerIds, printerId],
    }));
  };

  const selectStation = (id: string) => {
    const station = stations.find((item) => item.id === id);
    if (!station) {
      setDraft(emptyDraft());
      return;
    }
    setDraft({
      id: station.id,
      name: station.name,
      displayColor: station.displayColor || "#2563eb",
      printerIds: station.printerIds,
      categoryIds: station.routingRules.categoryIds,
    });
    setNotice(null);
    setLocalError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeLocationId || !user?.tenantId) return;
    setLocalError(null);
    setNotice(null);
    // An item only prints at the station that carries its category, so a station
    // without one would silently receive nothing.
    if (!draft.categoryIds.length) {
      setLocalError(t("settings.kdsStation.categoriesRequired"));
      return;
    }
    const routingRules = { categoryIds: draft.categoryIds };
    try {
      if (draft.id) {
        await updateStation(draft.id, {
          locationId: activeLocationId,
          name: draft.name,
          displayColor: draft.displayColor,
          printerIds: draft.printerIds,
          routingRules,
        });
      } else {
        const created = await createStation({
          tenantId: String(user.tenantId),
          locationId: activeLocationId,
          name: draft.name,
          displayColor: draft.displayColor,
          printerIds: draft.printerIds,
          routingRules,
        });
        setDraft((current) => ({ ...current, id: created.id }));
      }
      setNotice(t("settings.kdsStation.saved"));
    } catch (caught) {
      setNotice(null);
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("settings.kdsStation.saveFailed")
      );
    }
  };

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="pos-split grid min-h-full grid-cols-1 gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <aside className="max-h-64 min-h-0 min-w-0 overflow-y-auto rounded-xl bg-white p-3 shadow-sm lg:max-h-none">
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="mb-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
        >
          {t("settings.kdsStation.newStation")}
        </button>
        {stations.map((station) => (
          <button
            key={station.id}
            type="button"
            onClick={() => selectStation(station.id)}
            className={[
              "mb-1 w-full rounded-lg px-3 py-2 text-left text-sm",
              draft.id === station.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50",
            ].join(" ")}
          >
            <span
              className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: station.displayColor || "#2563eb" }}
            />
            {station.name}
          </button>
        ))}
      </aside>

      <section className="min-h-0 min-w-0 rounded-xl bg-white p-4 shadow-sm lg:overflow-y-auto">
        <label className="block text-sm text-slate-600">
          {t("settings.kdsStation.name")}
          <input
            className={fieldClass}
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-600">
            {t("settings.kdsStation.color")}
            <input
              type="color"
              className={`${fieldClass} h-11 p-1`}
              value={draft.displayColor}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  displayColor: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <h3 className="mt-4 text-sm font-semibold text-slate-800">
          {t("settings.kdsStation.printers")}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {t("settings.kdsStation.printersHint")}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {kdsPrinters.map((printer) => (
            <label key={printer.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.printerIds.includes(printer.id)}
                onChange={() => togglePrinter(printer.id)}
              />
              {printer.name}
            </label>
          ))}
        </div>
        {!kdsPrinters.length ? (
          <p className="mt-2 text-xs text-amber-700">
            {t("settings.kdsStation.noKdsPrinters")}
          </p>
        ) : null}

        <h3 className="mt-4 text-sm font-semibold text-slate-800">
          {t("settings.kdsStation.categories")}
        </h3>
        <p className="mt-1 text-xs text-slate-500">{t("settings.kdsStation.categoriesHint")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {categories.map((category) => (
            <label
              key={category.id}
              className="flex items-center gap-2 text-sm text-slate-700 disabled:text-slate-400"
            >
              <input
                type="checkbox"
                checked={draft.categoryIds.includes(category.id)}
                onChange={() => toggleCategory(category.id)}
              />
              {category.name}
              {otherStations.has(category.id)
                ? ` (${t("settings.kdsStation.assignedTo", {
                    station: otherStations.get(category.id)?.join(", "),
                  })})`
                : ""}
            </label>
          ))}
        </div>
        {draft.categoryIds.length ? (
          <p className="mt-3 text-xs text-slate-500">
            {draft.categoryIds
              .map((id) => categoryName.get(id) || id)
              .join(", ")}
          </p>
        ) : (
          <p className="mt-3 text-xs text-amber-700">
            {t("settings.kdsStation.categoriesRequired")}
          </p>
        )}

        {(localError || error) ? (
          <p className="mt-3 text-sm text-red-600">{localError || error}</p>
        ) : null}
        {notice ? <p className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button
            type="submit"
            isLoading={isLoading}
            disabled={!draft.name.trim() || !draft.printerIds.length || !draft.categoryIds.length}
          >
            {t("settings.kdsStation.save")}
          </Button>
          {draft.id ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void deleteStation(draft.id).then(() => {
                  setDraft(emptyDraft());
                  setNotice(t("settings.kdsStation.deleted"));
                });
              }}
            >
              {t("settings.kdsStation.delete")}
            </Button>
          ) : null}
        </div>
      </section>
    </form>
  );
}
