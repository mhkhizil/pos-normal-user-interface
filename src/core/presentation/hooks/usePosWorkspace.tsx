import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { PosWorkspaceSetupModal } from "@/components/PosWorkspaceSetupModal";
import { PosRegister, PosSession } from "@/core/domain/entities/Cashier";
import type { CurrentShift } from "@/core/domain/entities/Shift";
import { shiftApi } from "@/components/shift/shiftApi";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import {
  markPosWorkspaceBootstrapped,
  shouldBootstrapPosWorkspace,
} from "@/lib/pos/posWorkspace";

interface CashierContext {
  tenantId: string;
  locationId: string;
  posRegisterId: string;
  posSessionId: string;
}

interface PosWorkspaceContextType {
  activeLocationId: string;
  activePosRegisterId: string;
  activePosSessionId: string;
  posRegisters: PosRegister[];
  isPosSessionLoading: boolean;
  isSetupModalOpen: boolean;
  isWorkspaceReady: boolean;
  /** The POS device and its shift: what it sells, who has the shift, when a daily one ends. */
  currentShift: CurrentShift | null;
  requireCashierContext: () => Promise<CashierContext>;
  refreshPosContext: () => Promise<void>;
  /** After a shift is counted and closed: forget it, and ask for a new one unless signing out. */
  shiftClosed: (options?: { signingOut?: boolean }) => Promise<void>;
}

const PosWorkspaceContext = createContext<PosWorkspaceContextType | undefined>(
  undefined
);

export function PosWorkspaceProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const {
    inventoryLocations,
    activeLocationId,
    setActiveLocationId,
    fetchInventoryLocations,
    isLocationsLoading,
    fetchPosRegisters,
    createPosRegister,
    fetchPosSessions,
  } = useCashier();

  const tenantId = String(user?.tenantId || "");
  const cashierId = String(user?.id || "");

  const [activePosRegisterId, setActivePosRegisterId] = useState("");
  const [activePosSessionId, setActivePosSessionId] = useState("");
  const [posRegisters, setPosRegisters] = useState<PosRegister[]>([]);
  const [, setPosSessions] = useState<PosSession[]>([]);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [posSessionScopeKey, setPosSessionScopeKey] = useState("");
  const [isPosSessionLoading, setIsPosSessionLoading] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const buildRegisterCode = useCallback((resolvedLocationId: string) => {
    const suffix = resolvedLocationId.replace(/-/g, "").slice(0, 4).toUpperCase();
    return `R-${suffix || "MAIN"}`;
  }, []);

  const loadPosContextData = useCallback(
    async (resolvedTenantId: string, resolvedLocationId: string) => {
      const [registers, sessions] = await Promise.all([
        fetchPosRegisters({ page: 1, limit: 100 }),
        fetchPosSessions({ page: 1, limit: 200 }),
      ]);

      const tenantRegisters = registers.filter(
        (register) =>
          register.tenantId === resolvedTenantId &&
          register.locationId === resolvedLocationId
      );
      const registerPool = tenantRegisters.length ? tenantRegisters : registers;
      const registerIds = new Set(registerPool.map((register) => register.id));
      const relatedSessions = sessions.filter((session) =>
        registerIds.has(session.registerId)
      );

      setPosRegisters(registerPool);
      setPosSessions(relatedSessions);
      return { registers: registerPool, sessions: relatedSessions };
    },
    [fetchPosRegisters, fetchPosSessions]
  );

  const ensurePosSessionContext = useCallback(
    async (
      resolvedTenantId: string,
      resolvedLocationId: string,
      options?: {
        preferredRegisterId?: string;
        forceRefresh?: boolean;
      }
    ) => {
      if (!cashierId) {
        throw new Error("Cashier ID is missing from login session");
      }

      const scopeKey = `${resolvedTenantId}:${resolvedLocationId}:${cashierId}`;
      if (
        !options?.forceRefresh &&
        activePosSessionId &&
        activePosRegisterId &&
        posSessionScopeKey === scopeKey
      ) {
        return {
          posRegisterId: activePosRegisterId,
          posSessionId: activePosSessionId,
        };
      }

      setIsPosSessionLoading(true);
      try {
        const { registers } = await loadPosContextData(
          resolvedTenantId,
          resolvedLocationId
        );
        let register =
          (options?.preferredRegisterId
            ? registers.find((item) => item.id === options.preferredRegisterId)
            : undefined) ||
          registers.find((item) => item.id === activePosRegisterId) ||
          registers.find((item) => item.locationId === resolvedLocationId) ||
          registers.find((item) => item.tenantId === resolvedTenantId);

        if (!register) {
          const createdRegister = await createPosRegister({
            tenantId: resolvedTenantId,
            locationId: resolvedLocationId,
            code: buildRegisterCode(resolvedLocationId),
            name: "Default Register",
            macAddress: "00:00:00:00:00:00",
          });
          register = createdRegister;
          setPosRegisters((current) => [createdRegister, ...current]);
        }

        if (!register) {
          throw new Error("Unable to resolve POS register");
        }

        // A shift opens only with its drawer counted, never by itself. On a
        // per-login device only your own shift is yours to sell on; a daily
        // one is shared by whoever is on it.
        const current = await shiftApi().current(register.id);
        const usable =
          current.shift &&
          (current.shiftRule === "DAILY" || current.shift.cashierId === cashierId)
            ? current.shift.id
            : "";

        setCurrentShift(current);
        setActivePosRegisterId(register.id);
        setActivePosSessionId(usable);
        setPosSessionScopeKey(scopeKey);

        return {
          posRegisterId: register.id,
          posSessionId: usable,
          tillFree: !current.shift,
        };
      } finally {
        setIsPosSessionLoading(false);
      }
    },
    [
      activePosRegisterId,
      activePosSessionId,
      buildRegisterCode,
      cashierId,
      createPosRegister,
      loadPosContextData,
      posSessionScopeKey,
    ]
  );

  const resetPosState = useCallback(() => {
    setActivePosRegisterId("");
    setActivePosSessionId("");
    setPosRegisters([]);
    setPosSessions([]);
    setCurrentShift(null);
    setPosSessionScopeKey("");
  }, []);

  useEffect(() => {
    if (!tenantId || !cashierId) {
      setIsSetupModalOpen(false);
      return;
    }

    const initializeWorkspace = async () => {
      setErrorMessage(null);
      setNotice(null);

      const needsSetup = shouldBootstrapPosWorkspace(cashierId);
      if (needsSetup) {
        resetPosState();
        setIsSetupModalOpen(true);

        try {
          const resolvedLocationId = await fetchInventoryLocations(tenantId, {
            ignoreStored: true,
          });
          if (!resolvedLocationId) return;

          await ensurePosSessionContext(tenantId, resolvedLocationId, {
            forceRefresh: true,
          });
        } catch (caught) {
          setErrorMessage(
            caught instanceof Error
              ? caught.message
              : "Unable to initialize POS workspace"
          );
        }
        return;
      }

      try {
        const resolvedLocationId = await fetchInventoryLocations(tenantId);
        if (!resolvedLocationId) {
          setIsSetupModalOpen(true);
          return;
        }

        let result = await ensurePosSessionContext(tenantId, resolvedLocationId, {
          forceRefresh: true,
        });

        // Logging in opens your shift when the till is free, so every sale is
        // put to the person who made it.
        if (!result.posSessionId && "tillFree" in result && result.tillFree) {
          await shiftApi().open({
            tenantId,
            registerId: result.posRegisterId,
            cashierId,
          });
          result = await ensurePosSessionContext(tenantId, resolvedLocationId, {
            preferredRegisterId: result.posRegisterId,
            forceRefresh: true,
          });
        }

        if (!result.posSessionId) {
          setIsSetupModalOpen(true);
          return;
        }

        markPosWorkspaceBootstrapped(cashierId);
        setIsSetupModalOpen(false);
      } catch (caught) {
        setIsSetupModalOpen(true);
        setErrorMessage(
          caught instanceof Error
            ? caught.message
            : "Unable to initialize POS workspace"
        );
      }
    };

    void initializeWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per authenticated user
  }, [cashierId, tenantId]);

  useEffect(() => {
    if (!tenantId || !activeLocationId) {
      resetPosState();
    }
  }, [activeLocationId, resetPosState, tenantId]);

  const handleLocationChange = async (nextLocationId: string) => {
    setErrorMessage(null);
    setNotice(null);
    setActiveLocationId(nextLocationId);
    resetPosState();

    if (!tenantId || !nextLocationId) return;

    try {
      await ensurePosSessionContext(tenantId, nextLocationId, {
        forceRefresh: true,
      });
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error ? caught.message : t("cashier.errors.posSessionControl")
      );
    }
  };

  const handleRegisterChange = async (registerId: string) => {
    setErrorMessage(null);
    setNotice(null);
    setActivePosRegisterId(registerId);
    setActivePosSessionId("");
    setPosSessionScopeKey("");

    if (!tenantId || !activeLocationId || !registerId) return;

    try {
      const result = await ensurePosSessionContext(tenantId, activeLocationId, {
        preferredRegisterId: registerId,
        forceRefresh: true,
      });
      if (!result.posSessionId) {
        setNotice(t("cashier.pos.sessionRequired"));
      }
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error ? caught.message : t("cashier.errors.posSessionControl")
      );
    }
  };

  const handleOpenSession = async () => {
    setErrorMessage(null);
    setNotice(null);
    if (!tenantId || !activeLocationId || !activePosRegisterId) return;

    try {
      await shiftApi().open({
        tenantId,
        registerId: activePosRegisterId,
        cashierId,
      });
      await ensurePosSessionContext(tenantId, activeLocationId, {
        preferredRegisterId: activePosRegisterId,
        forceRefresh: true,
      });
      setNotice(t("cashier.pos.sessionOpened"));
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error ? caught.message : t("cashier.errors.posSessionControl")
      );
    }
  };

  const handleShiftClosedInSetup = async () => {
    if (!tenantId || !activeLocationId) return;
    await ensurePosSessionContext(tenantId, activeLocationId, {
      preferredRegisterId: activePosRegisterId || undefined,
      forceRefresh: true,
    });
  };

  const handleContinue = () => {
    if (!activePosSessionId || !cashierId) return;
    markPosWorkspaceBootstrapped(cashierId);
    setIsSetupModalOpen(false);
    setErrorMessage(null);
    setNotice(null);
  };

  const requireCashierContext = useCallback(async (): Promise<CashierContext> => {
    if (!tenantId) {
      throw new Error(t("cashier.errors.missingTenant"));
    }

    const resolvedLocationId =
      activeLocationId || (await fetchInventoryLocations(tenantId));
    if (!resolvedLocationId) {
      throw new Error(t("cashier.errors.missingLocation"));
    }

    const pos = await ensurePosSessionContext(tenantId, resolvedLocationId);
    if (!pos.posSessionId) {
      setIsSetupModalOpen(true);
      throw new Error(t("cashier.errors.missingPosSession"));
    }

    return {
      tenantId,
      locationId: resolvedLocationId,
      posRegisterId: pos.posRegisterId,
      posSessionId: pos.posSessionId,
    };
  }, [
    activeLocationId,
    ensurePosSessionContext,
    fetchInventoryLocations,
    t,
    tenantId,
  ]);

  // What a device sells and its shift can change in admin while staff are on it;
  // picked up again every minute and when the screen comes back.
  useEffect(() => {
    if (!activePosRegisterId) return;
    const reload = () => {
      shiftApi()
        .current(activePosRegisterId)
        .then(setCurrentShift)
        .catch(() => undefined);
    };
    const timer = window.setInterval(reload, 60_000);
    window.addEventListener("focus", reload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", reload);
    };
  }, [activePosRegisterId]);

  const shiftClosed = useCallback(
    async (options?: { signingOut?: boolean }) => {
      setActivePosSessionId("");
      setPosSessionScopeKey("");
      if (options?.signingOut || !tenantId || !activeLocationId) return;
      setIsSetupModalOpen(true);
      await ensurePosSessionContext(tenantId, activeLocationId, {
        preferredRegisterId: activePosRegisterId || undefined,
        forceRefresh: true,
      });
    },
    [activeLocationId, activePosRegisterId, ensurePosSessionContext, tenantId]
  );

  const refreshPosContext = useCallback(async () => {
    if (!tenantId || !activeLocationId) return;
    setPosSessionScopeKey("");
    await ensurePosSessionContext(tenantId, activeLocationId, {
      preferredRegisterId: activePosRegisterId || undefined,
    });
  }, [
    activeLocationId,
    activePosRegisterId,
    ensurePosSessionContext,
    tenantId,
  ]);

  const isWorkspaceReady = Boolean(
    activeLocationId && activePosRegisterId && activePosSessionId
  );

  const value = useMemo(
    () => ({
      activeLocationId,
      activePosRegisterId,
      activePosSessionId,
      posRegisters,
      isPosSessionLoading,
      isSetupModalOpen,
      isWorkspaceReady,
      currentShift,
      requireCashierContext,
      refreshPosContext,
      shiftClosed,
    }),
    [
      activeLocationId,
      activePosRegisterId,
      activePosSessionId,
      currentShift,
      isPosSessionLoading,
      isSetupModalOpen,
      isWorkspaceReady,
      posRegisters,
      refreshPosContext,
      requireCashierContext,
      shiftClosed,
    ]
  );

  return (
    <PosWorkspaceContext.Provider value={value}>
      {children}
      <PosWorkspaceSetupModal
        open={isSetupModalOpen}
        inventoryLocations={inventoryLocations}
        activeLocationId={activeLocationId}
        posRegisters={posRegisters}
        activePosRegisterId={activePosRegisterId}
        activePosSessionId={activePosSessionId}
        isLoading={isLocationsLoading || isPosSessionLoading}
        errorMessage={errorMessage}
        notice={notice}
        onLocationChange={(value) => void handleLocationChange(value)}
        onRegisterChange={(value) => void handleRegisterChange(value)}
        currentShift={currentShift}
        onOpenSession={() => void handleOpenSession()}
        onShiftClosed={() => void handleShiftClosedInSetup()}
        onContinue={handleContinue}
        onLogout={() => void logout()}
      />
    </PosWorkspaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook
export function usePosWorkspace() {
  const context = useContext(PosWorkspaceContext);
  if (context === undefined) {
    throw new Error("usePosWorkspace must be used within a PosWorkspaceProvider");
  }
  return context;
}
