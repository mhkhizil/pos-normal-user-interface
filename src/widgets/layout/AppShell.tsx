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
import { PosIconRail, type PosRailItem } from "./PosIconRail";

const iconClass = "h-5 w-5";

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 4h6v6H4zM14 4h6v9h-6zM4 14h6v6H4zM14 17h6v3h-6z" />
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

function WaitlistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M3 20v-2a5 5 0 0 1 10 0v2M16 7h5M16 12h5M16 17h5" />
    </svg>
  );
}

function TipsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5c-.6-.7-1.5-1-2.6-1-1.4 0-2.4.7-2.4 1.8 0 2.8 5.5 1.3 5.5 4.2 0 1.2-1.1 2-2.7 2-1.2 0-2.3-.4-3-1.2M12.5 5.5v2M12.5 15.5v2" />
    </svg>
  );
}

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

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true">
      <path d="M4 7h11a4 4 0 0 1 0 8H9" />
      <path d="m7 11-3-3 3-3M20 17H9a4 4 0 0 1 0-8h6" />
      <path d="m17 13 3 3-3 3" />
    </svg>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, setActiveBranch } = useAuth();
  const { activePosRegisterId } = usePosWorkspace();
  const printerConnection = usePrinterConnection(
    String(user?.tenantId || ""),
    activePosRegisterId
  );
  const { canAccess, isTabletAccount } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const isPosWorkspace = [
    "/cashier",
    "/ktv",
    "/spa",
    "/sales-orders",
    "/waitlist",
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
      visible: canAccess(PAGE_PERMISSIONS.cashier),
    },
    {
      to: "/ktv",
      label: t("shell.ktvTitle"),
      icon: <KtvIcon />,
      visible: canAccess(PAGE_PERMISSIONS.ktv),
    },
    {
      to: "/spa",
      label: t("shell.spaTitle"),
      icon: <SpaIcon />,
      visible: canAccess(PAGE_PERMISSIONS.spa),
    },
    {
      to: "/counter-orders",
      label: t("shell.counterOrdersTitle"),
      icon: <OrdersIcon />,
      visible: canAccess(PAGE_PERMISSIONS.counterOrders),
    },
    {
      to: "/sales-orders",
      label: t("shell.salesOrdersTitle"),
      icon: <SalesOrdersIcon />,
      visible: canAccess(PAGE_PERMISSIONS.salesOrders),
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
      visible: canAccess(PAGE_PERMISSIONS.waitlist),
    },
    {
      to: "/tip-pools",
      label: t("shell.tipPoolsTitle"),
      icon: <TipsIcon />,
      visible: canAccess(PAGE_PERMISSIONS.tipPools),
    },
    {
      to: "/sync",
      label: t("shell.syncTitle"),
      icon: <SyncIcon />,
      visible: canAccess(PAGE_PERMISSIONS.sync),
    },
    {
      to: "/dashboard",
      label: t("shell.dashboardTitle"),
      icon: <DashboardIcon />,
      visible: canAccess(PAGE_PERMISSIONS.dashboard),
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

  if (isTabletAccount) return <Navigate to="/tablet" replace />;

  return (
    <>
    <div
      className={[
        "pos-app-shell pos-touch-scroll grid h-[100dvh] min-h-[480px] min-w-0 overflow-hidden bg-black",
        showCheckoutActionRail
          ? "grid-cols-[3.5rem_minmax(0,1fr)_6.5rem]"
          : "grid-cols-[3.5rem_minmax(0,1fr)]",
      ].join(" ")}
    >
      <PosIconRail
        items={railItems}
        userName={currentUserName}
        profileLabel={t("settings.profileLabel")}
        printerLabel={t("shell.printer")}
        printerBadgeCount={
          !printerConnection.defaultBinding || printerConnection.error ? 1 : 0
        }
        notificationLabel={t("shell.notifications")}
        onNotificationsClick={() => navigate("/cashier?view=orders")}
        onPrinterClick={() => navigate("/settings/printer")}
        onProfileClick={() => navigate("/settings/cashier")}
      />

      <main
        className={[
          "pos-touch-scroll min-h-0 min-w-0",
          isPosWorkspace
            ? "overflow-y-auto overflow-x-hidden bg-[#080808]"
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

    <RoomOrderAlerts
      enabled={canAccess(["hospitality:spa-session:read"])}
      printKitchen={(slip) => printerConnection.printKitchen(slip)}
    />
    </>
  );
}
