import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "@/lib/appVersion";

export interface PosRailItem {
  to: string;
  label: string;
  icon: ReactNode;
  visible: boolean;
}

interface PosIconRailProps {
  items: PosRailItem[];
  userName: string;
  profileLabel: string;
  printerLabel?: string;
  printerBadgeCount?: number;
  notificationLabel?: string;
  notificationBadgeCount?: number;
  expanded?: boolean;
  overlay?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  onNavigate?: () => void;
  onProfileClick: () => void;
  onPrinterClick?: () => void;
  onNotificationsClick?: () => void;
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 9V3h12v6" />
      <rect x="6" y="13" width="12" height="8" rx="1" />
      <path d="M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function ChevronIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["h-4 w-4 transition-transform duration-200 ease-out", flipped ? "rotate-180" : ""].join(" ")}
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function PosIconRail({
  items,
  userName,
  profileLabel,
  printerLabel,
  printerBadgeCount = 0,
  notificationLabel,
  notificationBadgeCount = 0,
  expanded = false,
  overlay = false,
  onToggle,
  onClose,
  onNavigate,
  onProfileClick,
  onPrinterClick,
  onNotificationsClick,
}: PosIconRailProps) {
  const { t } = useTranslation();
  const showLabels = expanded || overlay;
  const labelClass = [
    "overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width,opacity] duration-200 ease-out",
    showLabels ? "max-w-[10rem] opacity-100" : "max-w-0 opacity-0",
  ].join(" ");
  const itemClass = (isActive: boolean) =>
    [
      "flex h-11 shrink-0 items-center overflow-hidden rounded-md transition-[width,padding,gap,background-color,color] duration-200 ease-out",
      showLabels ? "w-full gap-3 px-3" : "w-11 justify-center gap-0 px-0",
      isActive
        ? "bg-gradient-to-br from-[#ffc83d] to-[#ff5a00] text-black shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
        : "text-white/85 hover:bg-white/10 hover:text-white",
    ].join(" ");

  return (
    <aside
      id="pos-side-menu"
      className={[
        "pos-icon-rail pos-safe-y flex min-h-0 flex-col overflow-hidden border-r border-white/10 bg-black py-2 text-white transition-[width,padding] duration-200 ease-out",
        overlay
          ? "h-full w-[min(18rem,88vw)] px-2 shadow-[8px_0_24px_rgba(0,0,0,0.45)]"
          : showLabels
            ? "w-56 px-2"
            : "w-14 items-center px-1.5",
      ].join(" ")}
    >
      <div
        className={[
          "mb-2 flex shrink-0 gap-2",
          showLabels ? "items-center justify-between px-1" : "flex-col items-center",
        ].join(" ")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden"
            aria-hidden="true"
          >
            <img src="/logo.png" alt="" className="h-8 w-8 scale-150 object-contain" />
          </div>
          <span
            className={[
              "overflow-hidden whitespace-nowrap text-sm font-semibold transition-[max-width,opacity] duration-200 ease-out",
              showLabels ? "max-w-[8rem] opacity-100" : "max-w-0 opacity-0",
            ].join(" ")}
          >
            {t("shell.mainMenu")}
          </span>
        </div>
        {overlay && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
            aria-label={t("shell.closeMenu")}
          >
            <ChevronIcon />
          </button>
        ) : onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className={[
              "inline-flex h-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white",
              showLabels ? "w-9" : "w-9",
            ].join(" ")}
            aria-expanded={showLabels}
            aria-controls="pos-side-menu"
            aria-label={
              showLabels ? t("shell.collapseSidebar") : t("shell.expandSidebar")
            }
          >
            <ChevronIcon flipped={!showLabels} />
          </button>
        ) : null}
      </div>

      <nav
        className={[
          "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1",
          showLabels ? "items-stretch" : "items-center",
        ].join(" ")}
        aria-label={t("shell.mainMenu")}
      >
        {items
          .filter((item) => item.visible)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              aria-label={item.label}
              onClick={onNavigate}
              className={({ isActive }) => itemClass(isActive)}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {item.icon}
              </span>
              <span className={labelClass}>{item.label}</span>
            </NavLink>
          ))}
      </nav>

      {onNotificationsClick ? (
        <button
          type="button"
          onClick={() => {
            onNotificationsClick();
            onNavigate?.();
          }}
          aria-label={notificationLabel}
          className={[
            "relative mb-1 flex h-11 shrink-0 items-center overflow-hidden rounded-md text-white/85 transition-[width,padding,gap] duration-200 ease-out hover:bg-white/10 hover:text-white",
            showLabels ? "w-full gap-3 px-3" : "w-11 justify-center gap-0 px-0",
          ].join(" ")}
        >
          <BellIcon />
          <span className={labelClass}>{notificationLabel}</span>
          {notificationBadgeCount > 0 ? (
            <span
              className={[
                "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white",
                showLabels ? "ml-auto" : "absolute -right-0.5 -top-0.5",
              ].join(" ")}
            >
              {notificationBadgeCount > 99 ? "99+" : notificationBadgeCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {onPrinterClick ? (
        <button
          type="button"
          title={printerLabel}
          aria-label={printerLabel}
          onClick={() => {
            onPrinterClick();
            onNavigate?.();
          }}
          className={[
            "relative mb-2 flex h-11 shrink-0 items-center overflow-hidden rounded-md text-white/85 transition-[width,padding,gap] duration-200 ease-out hover:bg-white/10 hover:text-white",
            showLabels ? "w-full gap-3 px-3" : "w-11 justify-center gap-0 px-0",
          ].join(" ")}
        >
          <PrinterIcon />
          <span className={labelClass}>{printerLabel}</span>
          {printerBadgeCount > 0 ? (
            <span
              className={[
                "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white",
                showLabels ? "ml-auto" : "absolute -right-0.5 -top-0.5",
              ].join(" ")}
            >
              {printerBadgeCount > 9 ? "9+" : printerBadgeCount}
            </span>
          ) : null}
        </button>
      ) : null}

      <button
        type="button"
        title={profileLabel}
        aria-label={profileLabel}
        onClick={() => {
          onProfileClick();
          onNavigate?.();
        }}
        className={[
          "mt-2 flex h-10 shrink-0 items-center overflow-hidden rounded-full border-2 border-[#ff8a1a] bg-[#0886f0] text-sm font-bold text-white transition-[width,padding,gap] duration-200 ease-out hover:border-[#ffc83d]",
          showLabels ? "w-full gap-2 px-2" : "w-10 justify-center gap-0 px-0",
        ].join(" ")}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span
          className={[
            "overflow-hidden whitespace-nowrap text-left text-xs font-semibold transition-[max-width,opacity] duration-200 ease-out",
            showLabels ? "max-w-[8rem] opacity-100" : "max-w-0 opacity-0",
          ].join(" ")}
        >
          {userName}
        </span>
      </button>
      <span
        className={[
          "max-w-12 truncate text-[10px] text-white/80 transition-[opacity,margin,height] duration-200 ease-out",
          showLabels ? "mt-0 h-0 overflow-hidden opacity-0" : "mt-1 h-auto opacity-100",
        ].join(" ")}
      >
        {userName}
      </span>
      <span
        className="mt-1 max-w-full truncate text-center text-[10px] text-white/40"
        title={t("shell.appVersion", { version: APP_VERSION })}
      >
        {t("shell.appVersion", { version: APP_VERSION })}
      </span>
    </aside>
  );
}
