import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import {
  KitchenPrinter,
  PRINTER_AREAS,
  PRINTER_SECTORS,
  PrinterArea,
  PrinterSector,
} from "@/core/domain/entities/KitchenPrinter";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { useKitchenPrinterManagement } from "@/core/presentation/hooks/useKitchenPrinterManagement";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { isBrowserPrinting } from "@/core/infrastructure/printing/PrinterClient";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import {
  PrinterBinding,
  PrinterTransport,
  removeLocalOnlyPrinterBindings,
} from "@/lib/pos/printerBindingStorage";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500";

const localId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `printer-${Date.now()}`;

const SECTOR_LABEL_KEYS: Record<PrinterSector, string> = {
  CHECKOUT: "settings.printer.sectorCheckout",
  FINANCE: "settings.printer.sectorFinance",
  KDS: "settings.printer.sectorKds",
};

const AREA_LABEL_KEYS: Record<PrinterArea, string> = {
  BAR: "settings.printer.areaBar",
  KTV: "settings.printer.areaKtv",
  SPA: "settings.printer.areaSpa",
};

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
  } = useKitchenPrinterManagement();
  const {
    stations,
    isLoading: stationsLoading,
    listStations,
    updateStation,
  } = useKdsStationManagement();
  const connection = usePrinterConnection(tenantId, activePosRegisterId);
  const nativeBridge = connection.nativeBridge;

  const [selectedBackendId, setSelectedBackendId] = useState("");
  const [selectedBindingId, setSelectedBindingId] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<PrinterTransport>("NETWORK");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState("9100");
  const [deviceName, setDeviceName] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [sectors, setSectors] = useState<PrinterSector[]>([]);
  const [printsFor, setPrintsFor] = useState<PrinterArea[]>([]);
  const [stationIds, setStationIds] = useState<string[]>([]);
  /**
   * Whether the operator has chosen the stations by hand in this session. Until
   * they do, the stations a printer already serves are kept as they are: the
   * checkbox list starts empty while it loads, and saving that would clear every
   * station the printer belongs to.
   */
  const [stationsTouched, setStationsTouched] = useState(false);
  const [verifiedBinding, setVerifiedBinding] = useState<PrinterBinding | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    removeLocalOnlyPrinterBindings(tenantId, activePosRegisterId || "");
  }, [activePosRegisterId, tenantId]);

  const applyLiveUsbPrinters = (names: string[]) => {
    const next = names[0] || "";
    setDeviceName(next);
    setVerifiedBinding(null);
    if (next) {
      setLocalError(null);
      setNotice(t("settings.printer.usbDetected", { name: next }));
      return;
    }
    setNotice(null);
    setLocalError(t("settings.printer.usbNonePlugged"));
  };

  useEffect(() => {
    if (transport !== "USB") return;
    void connection
      .discover("USB")
      .then(applyLiveUsbPrinters)
      .catch(() => {
        setDeviceName("");
        setVerifiedBinding(null);
      });
  }, [connection.discover, t, transport]);

  useEffect(() => {
    void listPrinters({
      page: 1,
      limit: 100,
      locationId: activeLocationId || undefined,
      sortBy: "createdAt",
      sortOrder: "desc",
    }).catch(() => undefined);
  }, [activeLocationId, listPrinters]);

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
    setSectors([]);
    setPrintsFor([]);
    setStationIds([]);
    setStationsTouched(false);
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
    setTransport(
      binding?.transport || (printer.ipAddress ? "NETWORK" : "USB")
    );
    setIpAddress(printer.ipAddress || "");
    setPort(String(printer.port));
    setDeviceName(binding?.deviceName || "");
    setIsActive(printer.isActive);
    setIsDefault(connection.defaultBinding?.id === binding?.id);
    setSectors(printer.sectors || []);
    setPrintsFor(printer.printsFor || []);
    setStationIds(
      stations
        .filter((station) => station.printerIds.includes(printer.id))
        .map((station) => station.id)
    );
    setStationsTouched(false);
    setVerifiedBinding(binding || null);
    setNotice(null);
    setLocalError(null);
  };

  const draftBinding = (): PrinterBinding => ({
    id: selectedBindingId || selectedBackendId || localId(),
    backendPrinterId: selectedBackendId || undefined,
    transport,
    displayName: name.trim(),
    deviceName: transport === "NETWORK" ? undefined : deviceName,
    host: transport === "NETWORK" ? ipAddress.trim() : undefined,
    port: transport === "NETWORK" ? Number(port) : undefined,
    sectors,
    printsFor,
    lastVerifiedAt: "",
    lastError: null,
  });

  const servesKds = sectors.includes("KDS");
  /** A printer that prints slips has to say which parts of the venue they belong to. */
  const printsSlips = sectors.some((sector) => sector !== "KDS");
  const canAssignStations =
    servesKds && Boolean(selectedBackendId || transport === "NETWORK");

  const toggleSector = (sector: PrinterSector) => {
    setSectors((current) => {
      const next = current.includes(sector)
        ? current.filter((item) => item !== sector)
        : [...current, sector];
      if (!next.includes("KDS")) {
        setStationIds([]);
        // Dropping KDS from a printer is a deliberate "stop sending tickets
        // here", so its station assignments go with it.
        setStationsTouched(true);
      }
      return next;
    });
  };

  const toggleArea = (area: PrinterArea) => {
    setPrintsFor((current) =>
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area]
    );
  };

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

  const syncStationAssignments = async (
    printerId: string,
    selectedStationIds: string[]
  ) => {
    await Promise.all(
      stations.flatMap((station) => {
        const isAssigned = station.printerIds.includes(printerId);
        const shouldAssign = selectedStationIds.includes(station.id);
        if (isAssigned === shouldAssign) return [];

        const printerIds = shouldAssign
          ? [...station.printerIds, printerId]
          : station.printerIds.filter((id) => id !== printerId);
        return [
          updateStation(station.id, {
            printerIds: Array.from(new Set(printerIds)),
          }),
        ];
      })
    );
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

    const portNumber = Number(port) || 9100;
    const networkAddress = transport === "NETWORK" ? ipAddress.trim() : "";
    if (
      !activeLocationId ||
      !name.trim() ||
      !sectors.length ||
      !Number.isInteger(portNumber) ||
      portNumber < 1 ||
      portNumber > 65535
    ) {
      setLocalError(
        sectors.length
          ? t("settings.printer.saveFailed")
          : t("settings.printer.sectorsRequired")
      );
      return;
    }
    if (transport !== "NETWORK" && (!connected || !verified)) return;

    // A slip printer serves a place of the venue: Bar, KTV or SPA. Without one it
    // would take every place's slips, which is how a KTV bill reached the bar.
    if (printsSlips && !printsFor.length) {
      setLocalError(t("settings.printer.placesRequired"));
      return;
    }

    try {
      const base = {
        locationId: activeLocationId,
        name: name.trim(),
        ...(networkAddress ? { ipAddress: networkAddress } : {}),
        port: portNumber,
        sectors,
        printsFor,
      };
      // The printer record is shared by every till, so this device never writes
      // its own reachability into it: one till that cannot reach the paper must
      // not switch the printer off for the others. A new record starts active.
      const printer = selectedBackendId
        ? await updatePrinter(selectedBackendId, base)
        : await createPrinter({ tenantId, ...base, isActive: true });
      setSelectedBackendId(printer.id);
      const printerSectors = printer.sectors?.length ? printer.sectors : sectors;
      setSectors(printerSectors);
      const printerAreas = printer.printsFor?.length ? printer.printsFor : printsFor;
      setPrintsFor(printerAreas);

      // Save the printer on this device whether or not its test print answered.
      // The operator asked for this printer here; a failed test must not leave
      // the device running yesterday's configuration, which is what made a till
      // have to be saved over and over before its paper came out right.
      const binding: PrinterBinding = {
        ...draft,
        ...(verified || {}),
        id: verified?.id || draft.id,
        backendPrinterId: printer.id,
        host: printer.ipAddress,
        port: printer.port,
        sectors: printerSectors,
        // Kept on the device as well, so a till that cannot reach the printer list
        // still knows which counter serves which area of the venue.
        printsFor: printerAreas,
      };
      connection.saveBinding(binding, isDefault);
      setSelectedBindingId(binding.id);
      setVerifiedBinding(connected ? binding : null);

      // Which stations this printer serves: what the operator ticked, or — when
      // they did not touch the list — what it already serves. Sending a list
      // seeded before the stations had loaded is what used to strip a printer
      // from every station and stop the kitchen printing everywhere.
      const serves = stations
        .filter((station) => station.printerIds.includes(printer.id))
        .map((station) => station.id);
      await syncStationAssignments(
        printer.id,
        !stationsTouched
          ? serves
          : printerSectors.includes("KDS")
            ? stationIds
            : []
      );
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

  return (
    <div className="pos-split grid min-h-[34rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate font-bold">{t("settings.printer.devices")}</h2>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white"
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
                {printer.sectors?.length
                  ? printer.sectors.join(" · ")
                  : t("settings.printer.noSectors")}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {printer.printsFor?.length
                  ? printer.printsFor.join(" · ")
                  : t("settings.printer.printForAll")}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {printer.ipAddress
                  ? `${printer.ipAddress}:${printer.port}`
                  : t("settings.printer.noIp")}
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
              {nativeBridge
                ? t("settings.printer.nativeRequirement")
                : isBrowserPrinting()
                  ? t("settings.printer.mobileRequirement")
                  : t("settings.printer.qzRequirement")}
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
              ? t(
                  nativeBridge
                    ? "settings.printer.nativeConnected"
                    : isBrowserPrinting()
                      ? "settings.printer.mobileConnected"
                      : "settings.printer.connected"
                )
              : t(
                  nativeBridge
                    ? "settings.printer.nativeDisconnected"
                    : isBrowserPrinting()
                      ? "settings.printer.mobileDisconnected"
                      : "settings.printer.disconnected"
                )}
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
              <div>
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
                <p className="mt-1 text-xs text-slate-500">
                  {t("settings.printer.ipOptional")}
                </p>
              </div>
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
              {nativeBridge ? (
                <p className="sm:col-span-2 text-xs text-slate-500">
                  {t("settings.printer.networkNativeHint")}
                </p>
              ) : isBrowserPrinting() ? (
                <p className="sm:col-span-2 text-xs text-slate-500">
                  {t("settings.printer.networkAndroidHint")}
                </p>
              ) : null}
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
                  {deviceName && !connection.deviceNames.includes(deviceName) ? (
                    <option value={deviceName}>{deviceName}</option>
                  ) : null}
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
                  onClick={() => {
                    void connection
                      .discover(transport)
                      .then(applyLiveUsbPrinters)
                      .catch(() => undefined);
                  }}
                >
                  {t("settings.printer.discover")}
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t("settings.printer.usbDiscoverHint")}
              </p>
            </label>
          )}
        </div>

        <p className="mt-4 text-sm text-slate-600">
          {t("settings.printer.active")}:{" "}
          <span className={isActive ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>
            {isActive ? t("settings.printer.yes") : t("settings.printer.no")}
          </span>
        </p>
        <fieldset className="mt-4">
          <legend className="text-sm text-slate-600">
            {t("settings.printer.sectors")}
          </legend>
          <p className="mt-1 text-xs text-slate-500">
            {t("settings.printer.sectorsHint")}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {PRINTER_SECTORS.map((sector) => (
              <label
                key={sector}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={sectors.includes(sector)}
                  onChange={() => toggleSector(sector)}
                />
                {t(SECTOR_LABEL_KEYS[sector])}
              </label>
            ))}
          </div>
        </fieldset>
        {printsSlips ? (
          <fieldset className="mt-4">
            <legend className="text-sm text-slate-600">
              {t("settings.printer.printFor")}
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              {t("settings.printer.printForHint")}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PRINTER_AREAS.map((area) => (
                <label
                  key={area}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={printsFor.includes(area)}
                    onChange={() => toggleArea(area)}
                  />
                  {t(AREA_LABEL_KEYS[area])}
                </label>
              ))}
            </div>
            {!printsFor.length ? (
              <p className="mt-1 text-xs text-amber-700">
                {t("settings.printer.placesRequired")}
              </p>
            ) : null}
          </fieldset>
        ) : null}
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
        {servesKds ? (
        <fieldset className="mt-4">
          <legend className="text-sm text-slate-600">
            {t("settings.printer.kdsStations")}
          </legend>
          <p className="mt-1 text-xs text-slate-500">
            {t("settings.printer.kdsStationsHint")}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {stations.map((station) => (
              <label
                key={station.id}
                className="flex items-center gap-2 text-sm text-slate-700 disabled:text-slate-400"
              >
                <input
                  type="checkbox"
                  checked={stationIds.includes(station.id)}
                  disabled={stationsLoading || !canAssignStations}
                  onChange={() => {
                    setStationsTouched(true);
                    setStationIds((current) =>
                      current.includes(station.id)
                        ? current.filter((id) => id !== station.id)
                        : [...current, station.id]
                    );
                  }}
                />
                {station.name}
              </label>
            ))}
          </div>
          {!canAssignStations ? (
            <p className="mt-2 text-xs text-amber-700">
              {t("settings.printer.kdsBackendRequired")}
            </p>
          ) : null}
        </fieldset>
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
            disabled={!name.trim() || !activeLocationId || !tenantId || !sectors.length}
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
