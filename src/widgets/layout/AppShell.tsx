import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import {
  PAGE_PERMISSIONS,
  usePermissions,
} from "@/features/permissions/usePermissions";
import { PosActionRail } from "./PosActionRail";
import { RoomOrderAlerts } from "./RoomOrderAlerts";
import { Toaster } from "@/components/ui/Toaster";
import { PrintPreviewDialog } from "@/components/printing/PrintPreviewDialog";
import { ShiftDayBanner } from "@/components/shift/ShiftDayBanner";
import type { PosKind } from "@/core/domain/entities/Shift";
import { hiddenPosScreen } from "@/lib/pos/posScreens";
import { PosIconRail, type PosRailItem } from "./PosIconRail";

const iconClass = "h-5 w-5";
const NAV_EXPANDED_KEY = "pos:navExpanded";

function useNarrowViewport(maxWidth = 767) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= maxWidth : false
  );

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [maxWidth]);

  return narrow;
}

function MenuIcon() {
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
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 4h6v6H4zM14 4h6v9h-6zM4 14h6v6H4zM14 17h6v3h-6z" />
    </svg>
  );
}

function SalesSummaryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function CashierIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 5h16v14H4zM7 9h10M7 13h6M8 19v2M16 19v2" />
    </svg>
  );
}

function KtvIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M5 5h14v14H5zM9 9h6M8 13h8M10 17h4" />
      <circle cx="12" cy="9" r="1" />
    </svg>
  );
}

function HostessIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3 3 0 0 1 0 5M18 14c2 .8 3 2.7 3 6" />
    </svg>
  );
}

function SpaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M12 3c2 3 3 5 3 7a3 3 0 0 1-6 0c0-2 1-4 3-7zM4 14c3 0 5 2 8 6 3-4 5-6 8-6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5a3 3 0 0 1 0 6M18 14a4 4 0 0 1 3 4v2" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 5h16v15H4zM8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 12h4M15 12h2M7 9h10" />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 6h16M4 12h10M4 18h16" />
      <path d="M18 10v4M16 12h4" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </svg>
  );
}

function TablesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <rect x="3" y="4" width="7" height="6" rx="1" />
      <rect x="14" y="4" width="7" height="6" rx="1" />
      <rect x="3" y="14" width="7" height="6" rx="1" />
      <rect x="14" y="14" width="7" height="6" rx="1" />
    </svg>
  );
}

function WaitlistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M3 20v-2a5 5 0 0 1 10 0v2M16 7h5M16 12h5M16 17h5" />
    </svg>
  );
}

// function TipsIcon() {
//   return (
//     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
//       <circle cx="12" cy="12" r="9" />
//       <path d="M15 8.5c-.6-.7-1.5-1-2.6-1-1.4 0-2.4.7-2.4 1.8 0 2.8 5.5 1.3 5.5 4.2 0 1.2-1.1 2-2.7 2-1.2 0-2.3-.4-3-1.2M12.5 5.5v2M12.5 15.5v2" />
//     </svg>
//   );
// }

function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" />
    </svg>
  );
}

function SalesOrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 7h16v13H4z" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function RefundsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 7h11a4 4 0 1 1 0 8H8" />
      <path d="M8 11 4 15l4 4" />
    </svg>
  );
}

// function SyncIcon() {
//   return (
//     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
//       <path d="M4 7h11a4 4 0 0 1 0 8H9" />
//       <path d="m7 11-3-3 3-3M20 17H9a4 4 0 0 1 0-8h6" />
//       <path d="m17 13 3 3-3 3" />
//     </svg>
//   );
// }

export function AppShell() {
  const { t } = useTranslation();
  const { user, setActiveBranch } = useAuth();
  const { activePosRegisterId, activeLocationId, currentShift } = usePosWorkspace();
  const sells = (kind: PosKind) => !currentShift || currentShift.sellsAt.includes(kind);
  const printerConnection = usePrinterConnection(
    String(user?.tenantId || ""),
    activePosRegisterId,
    activeLocationId
  );
  const { canAccess, isTabletAccount } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const isNarrow = useNarrowViewport();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return localStorage.getItem(NAV_EXPANDED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPosWorkspace = [
    "/cashier",
    "/ktv",
    "/hostesses",
    "/spa",
    "/sales-orders",
    "/waitlist",
    "/dining-tables",
    "/products",
    "/categories",
    "/tip-pools",
    "/counter-orders",
    "/customers",
    "/cards",
  ].some((path) => location.pathname.startsWith(path));
  const isFullBleedLightPage = ["/settings", "/sync"].some((path) =>
    location.pathname.startsWith(path)
  );

  const currentUserName =
    user?.nickname || user?.name || t("shell.userFallback");
  const branchIds = Array.from(
    new Set(
      (user?.branchAccess || [])
        .map((entry) => entry.branchId)
        .filter(Boolean)
    )
  );

  const cashierView = location.pathname.startsWith("/cashier")
    ? new URLSearchParams(location.search).get("view")
    : null;
  const ktvRoomMatch = location.pathname.match(/^\/ktv\/room\/([^/]+)/);
  const ktvView = ktvRoomMatch
    ? new URLSearchParams(location.search).get("view")
    : null;

  const railItems: PosRailItem[] = [
    {
      to: "/cashier",
      label: t("shell.cashierTitle"),
      icon: <CashierIcon />,
      visible: canAccess(PAGE_PERMISSIONS.cashier) && sells("BAR"),
    },
    {
      to: "/ktv",
      label: t("shell.ktvTitle"),
      icon: <KtvIcon />,
      visible: canAccess(PAGE_PERMISSIONS.ktv) && sells("KTV"),
    },
    {
      to: "/hostesses",
      label: t("shell.hostessesTitle"),
      icon: <HostessIcon />,
      visible: canAccess(PAGE_PERMISSIONS.hostesses) && sells("KTV"),
    },
    {
      to: "/spa",
      label: t("shell.spaTitle"),
      icon: <SpaIcon />,
      visible: canAccess(PAGE_PERMISSIONS.spa) && sells("SPA"),
    },
    {
      to: "/counter-orders",
      label: t("shell.counterOrdersTitle"),
      icon: <OrdersIcon />,
      visible: canAccess(PAGE_PERMISSIONS.counterOrders) && sells("BAR"),
    },
    {
      to: "/sales-orders",
      label: t("shell.salesOrdersTitle"),
      icon: <SalesOrdersIcon />,
      visible: canAccess(PAGE_PERMISSIONS.salesOrders),
    },
    {
      to: "/refunds",
      label: t("shell.refundsTitle"),
      icon: <RefundsIcon />,
      visible: canAccess(PAGE_PERMISSIONS.refunds),
    },
    {
      to: "/customers",
      label: t("shell.customersTitle"),
      icon: <CustomersIcon />,
      visible: canAccess(PAGE_PERMISSIONS.customers),
    },
    {
      to: "/cards",
      label: t("shell.cardsTitle"),
      icon: <CardsIcon />,
      visible: canAccess(PAGE_PERMISSIONS.cards),
    },
    {
      to: "/waitlist",
      label: t("shell.waitlistTitle"),
      icon: <WaitlistIcon />,
      visible: canAccess(PAGE_PERMISSIONS.waitlist) && sells("BAR"),
    },
    {
      to: "/dining-tables",
      label: t("shell.diningTablesTitle"),
      icon: <TablesIcon />,
      visible: canAccess(PAGE_PERMISSIONS.diningTables) && sells("BAR"),
    },
    {
      to: "/products",
      label: t("shell.productsTitle"),
      icon: <ProductsIcon />,
      visible: canAccess(PAGE_PERMISSIONS.products),
    },
    {
      to: "/categories",
      label: t("shell.categoriesTitle"),
      icon: <CategoriesIcon />,
      visible: canAccess(PAGE_PERMISSIONS.categories),
    },
    // {
    //   to: "/tip-pools",
    //   label: t("shell.tipPoolsTitle"),
    //   icon: <TipsIcon />,
    //   visible: canAccess(PAGE_PERMISSIONS.tipPools),
    // },
    // {
    //   to: "/sync",
    //   label: t("shell.syncTitle"),
    //   icon: <SyncIcon />,
    //   visible: canAccess(PAGE_PERMISSIONS.sync),
    // },
    {
      to: "/dashboard",
      label: t("shell.dashboardTitle"),
      icon: <DashboardIcon />,
      visible: canAccess(PAGE_PERMISSIONS.dashboard),
    },
    {
      to: "/sales-summary",
      label: t("shell.salesSummaryTitle"),
      icon: <SalesSummaryIcon />,
      visible: canAccess(PAGE_PERMISSIONS.salesSummary),
    },
    {
      to: "/users",
      label: t("shell.usersTitle"),
      icon: <UsersIcon />,
      visible: canAccess(PAGE_PERMISSIONS.users),
    },
  ];

  const openCashierView = (view: "menu" | "orders" | "pay") => {
    navigate(`/cashier?view=${view}`);
  };

  const openActivePosView = (view: "menu" | "orders" | "pay") => {
    if (ktvRoomMatch) {
      if (view === "orders") {
        navigate("/ktv");
        return;
      }
      navigate(`/ktv/room/${ktvRoomMatch[1]}?view=${view}`);
      return;
    }
    openCashierView(view);
  };

  const showCheckoutActionRail =
    location.pathname.startsWith("/cashier") || Boolean(ktvRoomMatch);
  const actionRailView = ktvRoomMatch ? ktvView : cashierView;

  const handleBranchChange = async (branchId: string) => {
    try {
      await setActiveBranch(branchId);
      openCashierView("orders");
    } catch (error) {
      console.error("Unable to switch branch:", error);
    }
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const toggleSidebar = () => {
    setSidebarExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(NAV_EXPANDED_KEY, String(next));
      } catch {
        // Embedded WebViews may deny local storage.
      }
      return next;
    });
  };

  const closeMobileMenu = () => setMobileOpen(false);

  if (isTabletAccount) return <Navigate to="/tablet" replace />;
  const ownScreen = currentShift ? hiddenPosScreen(location.pathname, currentShift.sellsAt) : null;
  if (ownScreen) return <Navigate to={ownScreen} replace />;

  const navMode = isNarrow
    ? "overlay"
    : sidebarExpanded
      ? "docked-expanded"
      : "docked-collapsed";
  const gridCols = isNarrow
    ? showCheckoutActionRail
      ? "grid-cols-[minmax(0,1fr)_minmax(5.25rem,6.5rem)]"
      : "grid-cols-[minmax(0,1fr)]"
    : showCheckoutActionRail
      ? sidebarExpanded
        ? "grid-cols-[14rem_minmax(0,1fr)_6.5rem]"
        : "grid-cols-[3.5rem_minmax(0,1fr)_6.5rem]"
      : sidebarExpanded
        ? "grid-cols-[14rem_minmax(0,1fr)]"
        : "grid-cols-[3.5rem_minmax(0,1fr)]";

  const rail = (
    <PosIconRail
      items={railItems}
      userName={currentUserName}
      profileLabel={t("settings.profileLabel")}
      printerLabel={t("shell.printer")}
      printerBadgeCount={
        !printerConnection.defaultBinding || printerConnection.error ? 1 : 0
      }
      notificationLabel={t("shell.notifications")}
      expanded={isNarrow ? true : sidebarExpanded}
      overlay={isNarrow}
      onToggle={isNarrow ? undefined : toggleSidebar}
      onClose={isNarrow ? closeMobileMenu : undefined}
      onNavigate={isNarrow ? closeMobileMenu : undefined}
      onNotificationsClick={() => navigate("/cashier?view=orders")}
      onPrinterClick={() => navigate("/settings/printer")}
      onProfileClick={() => navigate("/settings/devices")}
    />
  );

  return (
    <>
    <div
      className={[
        "pos-app-shell pos-touch-scroll grid min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden bg-black transition-[grid-template-columns] duration-200 ease-out",
        gridCols,
      ].join(" ")}
      data-nav={navMode}
    >
      {isNarrow ? null : rail}

      <main
        className={[
          "pos-touch-scroll min-h-0 min-w-0",
          isPosWorkspace
            ? "overflow-hidden bg-[#080808]"
            : isFullBleedLightPage
              ? "overflow-y-auto overflow-x-hidden bg-slate-100"
              : "overflow-y-auto overflow-x-hidden bg-slate-100 p-4 text-slate-900 sm:p-5",
        ].join(" ")}
      >
        <Outlet />
      </main>

      {showCheckoutActionRail ? (
        <PosActionRail
          drawerLabel={t("shell.drawer")}
          menuLabel={t("shell.menu")}
          ordersLabel={t("shell.orders")}
          payLabel={t("shell.pay")}
          branchLabel={t("shell.branch")}
          activeBranchId={user?.activeBranchId}
          branches={branchIds}
          onBranchChange={(branchId) => void handleBranchChange(branchId)}
          onMenu={() => openActivePosView("menu")}
          onOrders={() =>
            ktvRoomMatch ? openActivePosView("orders") : navigate("/counter-orders")
          }
          onPay={() =>
            openActivePosView(actionRailView === "pay" ? "menu" : "pay")
          }
          activeView={
            actionRailView === "menu" || actionRailView === "pay"
              ? actionRailView
              : null
          }
        />
      ) : null}
    </div>

    {isNarrow ? (
      <button
        type="button"
        className={[
          // Stay below modal overlays (z-40). The day-ending banner leaves this
          // corner free on phones, so the menu remains reachable without
          // crossing above dialogs.
          "pos-nav-hamburger fixed z-30 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-black/80 text-white shadow-lg backdrop-blur-sm transition-opacity duration-200 ease-out",
          mobileOpen ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          left: "max(0.5rem, env(safe-area-inset-left))",
        }}
        aria-label={t("shell.openMenu")}
        aria-controls="pos-side-menu"
        aria-expanded={mobileOpen}
        aria-hidden={mobileOpen}
        tabIndex={mobileOpen ? -1 : undefined}
        onClick={() => setMobileOpen(true)}
      >
        <MenuIcon />
      </button>
    ) : null}
    {isNarrow ? (
      <div
        className={[
          "pos-nav-backdrop fixed inset-0 z-40 bg-black/55 transition-opacity duration-200 ease-out",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={closeMobileMenu}
        aria-hidden={!mobileOpen}
      />
    ) : null}
    {isNarrow ? (
      <div
        className={[
          "pos-side-drawer fixed inset-y-0 left-0 z-50 overflow-hidden transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "pointer-events-none -translate-x-full",
        ].join(" ")}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        {rail}
      </div>
    ) : null}

    <Toaster />

    <PrintPreviewDialog />

    <ShiftDayBanner />

    <RoomOrderAlerts
      enabled={canAccess(["hospitality:spa-session:read"])}
      printKitchen={(slip) => printerConnection.printKitchen(slip)}
    />
    </>
  );
}
