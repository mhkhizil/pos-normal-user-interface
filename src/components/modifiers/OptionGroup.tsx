import { useTranslation } from "react-i18next";
import { ModifierGroup } from "@/core/domain/entities/Cashier";
import { groupLimit, groupNeed } from "@/lib/modifiers/choices";

/** One group of options for an item, as the cashier and the room boards offer it. */
export function OptionGroup({
  group,
  selected,
  onToggle,
}: {
  group: ModifierGroup;
  selected: string[];
  onToggle: (optionId: string) => void;
}) {
  const { t } = useTranslation();
  const limit = groupLimit(group);
  const need = groupNeed(group);
  const picked = group.modifiers.filter((option) => selected.includes(option.id)).length;
  const hint =
    limit === 1
      ? t("cashier.productMenu.pickOne")
      : limit === Infinity
        ? t("cashier.productMenu.pickAny")
        : t("cashier.productMenu.pickUpTo", { count: limit });
  return (
    <fieldset className="mt-4">
      <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-semibold">
        <span>
          {group.name}
          {need > 0 ? (
            <span className="ml-2 text-xs font-normal text-amber-300">
              {t("cashier.productMenu.required")}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-normal text-slate-400">{hint}</span>
      </legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {group.modifiers.map((option) => {
          const on = selected.includes(option.id);
          const full = !on && limit !== 1 && picked >= limit;
          const price = Number(option.priceDelta) || 0;
          return (
            <button
              key={option.id}
              type="button"
              role={limit === 1 ? "radio" : "checkbox"}
              aria-checked={on}
              disabled={full}
              onClick={() => onToggle(option.id)}
              className={[
                "flex items-center justify-between gap-2 rounded border px-3 py-3 text-left text-sm",
                on ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900",
                full ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <span className="min-w-0 break-words">{option.name}</span>
              {price ? (
                <span className="shrink-0 text-xs text-blue-300">
                  {price > 0 ? "+" : ""}
                  {price}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
