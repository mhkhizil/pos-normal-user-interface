import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { KitchenPrinter } from "@/core/domain/entities/KitchenPrinter";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { useKitchenPrinterManagement } from "@/core/presentation/hooks/useKitchenPrinterManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import {
  PrinterBinding,
  PrinterTransport,
} from "@/lib/pos/printerBindingStorage";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500";

const localId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `printer-${Date.now()}`;

export function PrinterSettingsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeLocationId, activePosRegisterId } = usePosWorkspace();
  const tenantId = String(user?.tenantId || "");
  const {
    printers,
    isLoading,
    error: apiError,
    listPrinters,
    createPrinter,
    updatePrinter,
    deletePrinter,
    attachCategory,
    detachCategory,
  } = useKitchenPrinterManagement();
  const {
    stations,
    isLoading: stationsLoading,
    listStations,
  } = useKdsStationManagement();
  const connection = usePrinterConnection(tenantId, activePosRegisterId);

  const [selectedBackendId, setSelectedBackendId] = useState("");
  const [selectedBindingId, setSelectedBindingId] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<PrinterTransport>("NETWORK");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState("9100");
  const [deviceName, setDeviceName] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [stationId, setStationId] = useState("");
  const [verifiedBinding, setVerifiedBinding] = useState<PrinterBinding | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void listPrinters({
      page: 1,
      limit: 100,
      sortBy: "createdAt",
      sortOrder: "desc",
    }).catch(() => undefined);
  }, [listPrinters]);

  useEffect(() => {
    void listStations({
      page: 1,
      limit: 200,
      locationId: activeLocationId || undefined,
      sortBy: "name",
      sortOrder: "asc",
    }).catch(() => undefined);
  }, [activeLocationId, listStations]);

  const reset = () => {
    setSelectedBackendId("");
    setSelectedBindingId("");
    setName("");
    setTransport("NETWORK");
    setIpAddress("");
    setPort("9100");
    setDeviceName("");
    setIsActive(false);
    setIsDefault(false);
    setCategoryId("");
    setStationId("");
    setVerifiedBinding(null);
    setNotice(null);
    setLocalError(null);
  };

  const selectBackendPrinter = (printer: KitchenPrinter) => {
    const binding = connection.bindings.find(
      (item) => item.backendPrinterId === printer.id
    );
    setSelectedBackendId(printer.id);
    setSelectedBindingId(binding?.id || printer.id);
    setName(printer.name);
    setTransport("NETWORK");
    setIpAddress(printer.ipAddress);
    setPort(String(printer.port));
    setDeviceName(binding?.deviceName || "");
    setIsActive(printer.isActive);
    setIsDefault(connection.defaultBinding?.id === binding?.id);
    setStationId(binding?.stationId || "");
    setVerifiedBinding(binding || null);
    setNotice(null);
    setLocalError(null);
  };

  const selectLocalBinding = (binding: PrinterBinding) => {
    setSelectedBackendId(binding.backendPrinterId || "");
    setSelectedBindingId(binding.id);
    setName(binding.displayName);
    setTransport(binding.transport);
    setIpAddress(binding.host || "");
    setPort(String(binding.port || 9100));
    setDeviceName(binding.deviceName || "");
    setIsActive(Boolean(binding.lastVerifiedAt) && !binding.lastError);
    setIsDefault(connection.defaultBinding?.id === binding.id);
    setStationId(binding.stationId || "");
    setVerifiedBinding(binding);
    setNotice(null);
    setLocalError(null);
  };

  const localOnlyBindings = useMemo(
    () => connection.bindings.filter((binding) => !binding.backendPrinterId),
    [connection.bindings]
  );

  const draftBinding = (): PrinterBinding => ({
    id: selectedBindingId || selectedBackendId || localId(),
    backendPrinterId: selectedBackendId || undefined,
    transport,
    displayName: name.trim(),
    deviceName: transport === "NETWORK" ? undefined : deviceName,
    host: transport === "NETWORK" ? ipAddress.trim() : undefined,
    port: transport === "NETWORK" ? Number(port) : undefined,
    stationId: stationId.trim() || undefined,
    categoryIds: verifiedBinding?.categoryIds,
    lastVerifiedAt: "",
    lastError: null,
  });

  const testConnection = async () => {
    setNotice(null);
    setLocalError(null);
    try {
      const verified = await connection.verify(draftBinding());
      setVerifiedBinding(verified);
      setSelectedBindingId(verified.id);
      setIsActive(true);
      setNotice(t("settings.printer.testSucceeded"));
    } catch (caught) {
      setVerifiedBinding(null);
      setIsActive(false);
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("settings.printer.testFailed")
      );
    }
  };

  const save = async () => {
    setNotice(null);
    setLocalError(null);
    const draft = draftBinding();
    let connected = false;
    let verified: PrinterBinding | null = null;
    try {
      verified = await connection.verify(draft);
      connected = true;
      setVerifiedBinding(verified);
      setSelectedBindingId(verified.id);
    } catch (caught) {
      setVerifiedBinding(null);
      setLocalError(
        caught instanceof Error ? caught.message : t("settings.printer.testFailed")
      );
    }
    setIsActive(connected);

    if (transport !== "NETWORK") {
      if (!connected || !verified) return;
      connection.saveBinding(
        { ...verified, stationId: stationId.trim() || undefined },
        isDefault
      );
      setNotice(t("settings.printer.saved"));
      return;
    }

    const portNumber = Number(port);
    if (
      !activeLocationId ||
      !name.trim() ||
      !ipAddress.trim() ||
      !Number.isInteger(portNumber) ||
      portNumber < 1 ||
      portNumber > 65535
    ) {
      setLocalError(t("settings.printer.saveFailed"));
      return;
    }

    try {
      const payload = {
        locationId: activeLocationId,
        name: name.trim(),
        ipAddress: ipAddress.trim(),
        port: portNumber,
        isActive: connected,
      };
      const printer = selectedBackendId
        ? await updatePrinter(selectedBackendId, payload)
        : await createPrinter({ tenantId, ...payload });
      setSelectedBackendId(printer.id);
      if (connected && verified) {
        const binding = {
          ...verified,
          id: verified.id || printer.id,
          backendPrinterId: printer.id,
          host: printer.ipAddress,
          port: printer.port,
          stationId: stationId.trim() || undefined,
        };
        connection.saveBinding(binding, isDefault);
        setSelectedBindingId(binding.id);
        setVerifiedBinding(binding);
      } else if (selectedBindingId) {
        connection.removeBinding(selectedBindingId);
      }
      setNotice(
        connected ? t("settings.printer.saved") : t("settings.printer.savedInactive")
      );
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("settings.printer.saveFailed")
      );
    }
  };

  const remove = async () => {
    setNotice(null);
    setLocalError(null);
    try {
      if (selectedBackendId) await deletePrinter(selectedBackendId);
      if (selectedBindingId) connection.removeBinding(selectedBindingId);
      reset();
      setNotice(t("settings.printer.deleted"));
    } catch (caught) {
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("settings.printer.deleteFailed")
      );
    }
  };

  const routeCategory = async (attach: boolean) => {
    if (!selectedBackendId || !categoryId.trim()) return;
    setLocalError(null);
    try {
      const nextCategoryId = categoryId.trim();
      if (attach) await attachCategory(selectedBackendId, nextCategoryId);
      else await detachCategory(selectedBackendId, nextCategoryId);
      if (verifiedBinding) {
        const categoryIds = new Set(verifiedBinding.categoryIds || []);
        if (attach) categoryIds.add(nextCategoryId);
        else categoryIds.delete(nextCategoryId);
        const nextBinding = {
          ...verifiedBinding,
          categoryIds: Array.from(categoryIds),
        };
        connection.saveBinding(nextBinding, isDefault);
        setVerifiedBinding(nextBinding);
      }
      setNotice(
        t(
          attach
            ? "settings.printer.categoryAttached"
            : "settings.printer.categoryDetached"
        )
      );
      setCategoryId("");
    } catch (caught) {
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("settings.printer.categoryFailed")
      );
    }
  };

  return (
    <div className="pos-split grid min-h-[34rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{t("settings.printer.devices")}</h2>
          <button
            type="button"
            onClick={reset}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white"
          >
            {t("settings.printer.add")}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {printers.map((printer) => (
            <button
              key={printer.id}
              type="button"
              onClick={() => selectBackendPrinter(printer)}
              className={[
                "w-full rounded-lg border p-3 text-left text-sm",
                selectedBackendId === printer.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white",
              ].join(" ")}
            >
              <span className="block truncate font-semibold">{printer.name}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {printer.ipAddress}:{printer.port}
              </span>
            </button>
          ))}
          {localOnlyBindings.map((binding) => (
            <button
              key={binding.id}
              type="button"
              onClick={() => selectLocalBinding(binding)}
              className={[
                "w-full rounded-lg border p-3 text-left text-sm",
                selectedBindingId === binding.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white",
              ].join(" ")}
            >
              <span className="block truncate font-semibold">
                {binding.displayName}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {binding.transport} · {binding.deviceName}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{t("settings.printer.title")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("settings.printer.qzRequirement")}
            </p>
          </div>
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              connection.isConnected
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-600",
            ].join(" ")}
          >
            {connection.isConnected
              ? t("settings.printer.connected")
              : t("settings.printer.disconnected")}
          </span>
        </div>

        <dl className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t("settings.printer.connection")}</dt>
            <dd className="font-medium">{transport}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("settings.printer.systemPrinter")}</dt>
            <dd className="truncate font-medium">{deviceName || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("settings.printer.ipAddress")}</dt>
            <dd className="font-medium">{ipAddress || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("settings.printer.port")}</dt>
            <dd className="font-medium">{port || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("settings.printer.active")}</dt>
            <dd className="font-medium">
              {isActive ? t("settings.printer.yes") : t("settings.printer.no")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("settings.printer.lastVerified")}</dt>
            <dd className="font-medium">
              {verifiedBinding?.lastVerifiedAt
                ? new Date(verifiedBinding.lastVerifiedAt).toLocaleString()
                : t("settings.printer.notVerified")}
            </dd>
          </div>
        </dl>

        {(localError || apiError || connection.error) && (
          <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {localError || apiError || connection.error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-600">
            {t("settings.printer.name")}
            <input
              className={fieldClass}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setVerifiedBinding(null);
              }}
            />
          </label>
          <label className="block text-sm text-slate-600">
            {t("settings.printer.connection")}
            <select
              className={fieldClass}
              value={transport}
              onChange={(event) => {
                setTransport(event.target.value as PrinterTransport);
                setVerifiedBinding(null);
              }}
            >
              <option value="NETWORK">{t("settings.printer.connectionNetwork")}</option>
              <option value="USB">{t("settings.printer.connectionUsb")}</option>
              <option value="BLUETOOTH">
                {t("settings.printer.connectionBluetooth")}
              </option>
            </select>
          </label>
          {transport === "NETWORK" ? (
            <>
              <label className="block text-sm text-slate-600">
                {t("settings.printer.ipAddress")}
                <input
                  className={fieldClass}
                  value={ipAddress}
                  onChange={(event) => {
                    setIpAddress(event.target.value);
                    setVerifiedBinding(null);
                  }}
                />
              </label>
              <label className="block text-sm text-slate-600">
                {t("settings.printer.port")}
                <input
                  type="number"
                  className={fieldClass}
                  value={port}
                  onChange={(event) => {
                    setPort(event.target.value);
                    setVerifiedBinding(null);
                  }}
                />
              </label>
            </>
          ) : (
            <label className="block text-sm text-slate-600 sm:col-span-2">
              {t("settings.printer.systemPrinter")}
              <div className="flex gap-2">
                <select
                  className={fieldClass}
                  value={deviceName}
                  onChange={(event) => {
                    setDeviceName(event.target.value);
                    setVerifiedBinding(null);
                  }}
                >
                  <option value="">{t("settings.printer.selectPrinter")}</option>
                  {connection.deviceNames.map((device) => (
                    <option key={device} value={device}>
                      {device}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-1"
                  isLoading={connection.isConnecting}
                  onClick={() => void connection.discover()}
                >
                  {t("settings.printer.discover")}
                </Button>
              </div>
            </label>
          )}
        </div>

        <p className="mt-4 text-sm text-slate-600">
          {t("settings.printer.active")}:{" "}
          <span className={isActive ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>
            {isActive ? t("settings.printer.yes") : t("settings.printer.no")}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            {t("settings.printer.default")}
          </label>
        </div>
        <label className="mt-4 block text-sm text-slate-600">
          {t("settings.printer.stationId")}
          <select
            className={fieldClass}
            value={stationId}
            disabled={stationsLoading}
            onChange={(event) => setStationId(event.target.value)}
          >
            <option value="">{t("settings.printer.noStation")}</option>
            {stationId &&
            !stations.some((station) => station.id === stationId) ? (
              <option value={stationId}>{stationId}</option>
            ) : null}
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>

        {selectedBackendId ? (
          <div className="mt-5 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold">
              {t("settings.printer.categoryRouting")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="min-h-10 min-w-56 flex-1 rounded border border-slate-200 px-3 text-sm"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                placeholder={t("settings.printer.categoryId")}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void routeCategory(true)}
              >
                {t("settings.printer.attach")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void routeCategory(false)}
              >
                {t("settings.printer.detach")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            isLoading={connection.isConnecting}
            disabled={!name.trim()}
            onClick={() => void testConnection()}
          >
            {t("settings.printer.testPrint")}
          </Button>
          <Button
            type="button"
            isLoading={isLoading || connection.isConnecting}
            disabled={!name.trim() || !activeLocationId || !tenantId}
            onClick={() => void save()}
          >
            {t("settings.printer.save")}
          </Button>
          {(selectedBackendId || selectedBindingId) && (
            <Button
              type="button"
              variant="destructive"
              isLoading={isLoading}
              onClick={() => void remove()}
            >
              {t("settings.printer.delete")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
