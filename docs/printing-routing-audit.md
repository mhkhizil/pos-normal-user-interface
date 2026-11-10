# Printing routing audit — KDS / CHECKOUT / FINANCE

**Status:** findings only when written — the audit itself changed no code. Fixes
applied since are recorded in [§0 Status updates](#0-status-updates).

**Date:** 2026-11-09
**Scope:** `src/lib/printing/**`, `src/lib/pos/printerBindingStorage.ts`,
`src/core/presentation/hooks/usePrinterConnection.tsx`, the printer / KDS-station
settings panels, and every page that prints.
**Method:** full read of the routing core plus three independent read-only audits
(route, receipt copies, configuration persistence); every claim cross-checked
against source. Baseline test run recorded in [§10](#10-baseline-test-run).

---

## 0. Status updates

| Date | Finding | Change |
| --- | --- | --- |
| 2026-11-09 | **B3, B4** | **Fixed.** `resolveBindingsForPlace` no longer falls back to the default printer (or the only printer) for a section that printer does not declare. A printer's own sectors are now the last word: a `KDS`-only printer marked as the default no longer receives checkout receipts or finance copies. Only a printer that names **no** sectors at all — a pre-sectors setup, or a single-printer till — is still the register's catch-all, and the default printer is preferred among those. `printerBindingStorage.test.ts` updated, plus a regression test for the reported “Bar (KDS, default) prints checkout + finance” case. |
| 2026-11-09 | **B3, B4 (part two)** | **Fixed.** Routing reads `sectors` off the **local** `PrinterBinding`, but a binding only stores the sectors its printer had the last time that printer was saved **on this device**, and only when the save's test print succeeded (`PrinterSettingsPanel.tsx:287-296`). A binding could therefore name no sectors at all (saved before sectors existed) or ones the back office has since changed, and the KDS printer kept printing the till's documents while Settings — which shows the *printer record* — looked correct. `usePrinterConnection.bindingsWithSectors` now reads the outlet's printer records and makes their sectors authoritative before routing, matching by `backendPrinterId` and then by network address. |

Findings B1, B2, B5–B18 remain open.

---

## 1. The intended contract (as specified by the product owner)

A printer record carries `sectors: PrinterSector[]` where
`PrinterSector = "KDS" | "CHECKOUT" | "FINANCE"`
(`src/core/domain/entities/KitchenPrinter.ts:1-3`,
`src/lib/pos/printerBindingStorage.ts:2`).

| Print type | Must print on | Must **not** print on |
| --- | --- | --- |
| **CHECKOUT** | printers with sector `CHECKOUT` (guest bill / order receipt) | `KDS`, `FINANCE` |
| **FINANCE** | printers with sector `FINANCE` (office copy) | `KDS`, `CHECKOUT` |
| **KDS** | the printer(s) of the KDS station that owns the item's menu category | `CHECKOUT`, `FINANCE`, another station's printer |

KDS station routing, stated as the acceptance case:

> A customer orders **beer** (Beverages), **Chinese fried noodle** (Chinese) and
> **French toast** (French). There are three KDS stations — Beverages, Chinese,
> French. The beer must print only on the Beverages printer, the noodles only on
> the Chinese printer, the toast only on the French printer.
> The user must pick a KDS station; each station is bound to menu categories
> (`routingRules.categoryIds`) and to printer ids (`printerIds`).

---

## 2. How routing actually works today

```
CashierPage.handleFireKds ────┐
CashierPage.printKdsDelete ───┼─► printer.printKitchen(slip, stations,
SpaBoardPage.sendToKitchen ───┘                        { requireStationRouting: true })
                                        │
                                        ├─ groupKitchenJobs()          routeKitchenPrint.ts:117
                                        │    ├─ stationId given  → ALL lines → that station's printers   :133-175
                                        │    ├─ stations[] given → planFromStations(): per-line category :43-101
                                        │    └─ no stations      → bindingForLine() / defaultBinding    :192-196
                                        │
                                        └─ rescue if 0 jobs && !strict → resolveBindingsForPlace(...,"KDS") :331-341

AppShell / RoomOrderAlerts ─────► printer.printKitchen(slip)   // no stations, no options

printReceipt ───────────────────► resolveBindingsForPlace(bindings, defaultBinding, place)
                                   printerBindingStorage.ts:275-285
                                     ├─ exact sector match wins                        :280-281
                                     ├─ else **defaultBinding**  (sector-blind)        :282
                                     └─ else the only printer    (sector-blind)        :283-284
```

### The single most important fact

`listStoredPrinterBindings()` **always** invents a default binding
(`printerBindingStorage.ts:119-128`):

```ts
return { bindings, defaultBinding: savedDefault || bindings[0] || null };
```

Therefore `resolveBindingsForPlace` line 282 is reached on **every** register that
has at least one printer. Consequence: **`sectors` is effectively decorative**
whenever no printer matches the requested sector. Most findings below are
consequences of this one line.

---

## 3. Findings index

| ID | Severity | Area | One-liner | Changes flow? |
| --- | --- | --- | --- | --- |
| B1 | **BLOCKER** | KDS | Station printing silently dead when the station printer has no local binding | Yes |
| B2 | **BLOCKER** | KDS | No KDS stations configured ⇒ cashier prints *nothing* | Yes |
| B3 | **HIGH** | KDS vs CHECKOUT | A `CHECKOUT` printer receives kitchen tickets | Yes |
| B4 | **HIGH** | CHECKOUT vs FINANCE | A `FINANCE` printer receives checkout bills | Yes |
| B5 | **HIGH** | KDS | `printTicket` dumps the whole ticket onto one station's printer | Yes |
| B6 | **HIGH** | KDS | `binding.categoryIds` is dead code ⇒ every line to the default printer | Yes |
| B7 | **HIGH** | Config | Deleting a printer leaves dangling station routing | No |
| B8 | **HIGH** | Config | Saving a printer can silently unassign it from all stations | No |
| B9 | **HIGH** | Config | A failed test print destroys a working printer config | No |
| B10 | MEDIUM | All | A printer with no sectors matches *every* print type | Yes |
| B11 | MEDIUM | KDS | Station printers are never validated to be `KDS` at print time | No |
| B12 | MEDIUM | KDS | Duplicate bindings for one physical printer ⇒ double print | No |
| B13 | MEDIUM | All | Bindings fall back to *another register's* printers | No |
| B14 | MEDIUM | KDS | `missingPrinterRoutes` over-reports: successful prints shown as errors | No |
| B15 | MEDIUM | FINANCE | Shift report prints on the `CHECKOUT` printer | Yes |
| B16 | MEDIUM | Config | Opening the Printer tab deletes bindings without `backendPrinterId` | No |
| B17 | MEDIUM | Config | Station PATCH echo can wipe `routingRules`; the panel then persists the wipe | No |
| B18 | LOW | KDS | KDS board silently empty when the saved station was deleted | No |

Legend: **BLOCKER** = a core feature is dead in a realistic deployment;
**HIGH** = wrong paper at the wrong printer, or configuration data loss;
**MEDIUM** = wrong/incomplete behaviour with a workaround; **LOW** = cosmetic/UX.

---

## 4. Findings — BLOCKER

### B1 · KDS station printing is dead on any device without a local binding

**Rule broken:** KDS station routing · **Flow impact:** yes

`bindingsForStation` matches a station's `printerIds` only against **local**
`PrinterBinding` records, by `backendPrinterId`
(`src/lib/printing/routeKitchenPrint.ts:31-41`):

```ts
const bindingsForStation = (station, bindings) => {
  const printerIds = new Set(station.printerIds);
  return bindings.filter(
    (binding) => Boolean(binding.backendPrinterId) && printerIds.has(binding.backendPrinterId!)
  );
};
```

If this device/register has no binding for that printer, `stationBindings` is empty
and the line is pushed to `unrouted` (`routeKitchenPrint.ts:65`).

There is **no backend fallback for station jobs.**
`usePrinterConnection.printKitchen` disables its rescue path whenever the caller
asks for strict routing (`src/core/presentation/hooks/usePrinterConnection.tsx:331`):

```ts
if (!options.requireStationRouting && !jobs.length && lines.length) { ... }
```

and CashierPage always asks for strict routing (`src/pages/CashierPage.tsx:3091`
for the fire, `:2596` for the delete slip).

**Contributing trigger.** A local binding is only written when the printer's test
print succeeds at save time (`src/pages/settings/PrinterSettingsPanel.tsx:287-298`;
`connection.saveBinding` sits inside `if (connected && verified)`). A printer that
was briefly offline when it was configured keeps its back-office record but has no
local binding — permanently unrouted until someone re-tests it.

**User-visible symptom:** the cashier fires the order, the ticket appears on the
KDS screen, and the paper never prints. The cashier sees
`cashier.errors.kdsUnrouted` (“No station for: Beer, Chinese Fried Noodle, …”)
(`CashierPage.tsx:3094-3100`).

**Note the asymmetry:** `printReceipt` *does* have this fallback
(`usePrinterConnection.tsx:371-375`: `local.length ? local : backendTargets(place)`).
So on a fresh tablet checkout receipts print and kitchen tickets do not.

**Suggested fix (not applied):** give station routing the same
`backendTargets` fallback receipts already use — resolve a station's `printerIds`
against the back-office printer list when no local binding exists. Keep it inside
`requireStationRouting` so strict mode is preserved.

---

### B2 · A venue with no KDS stations can never print a kitchen ticket

**Rule broken:** KDS · **Flow impact:** yes

`routeKitchenPrint.ts:181-183`:

```ts
if (options.requireStationRouting) {
  return { jobs: [], unrouted: lines, missingPrinterRoutes: [] };
}
```

CashierPage builds the station list like this (`CashierPage.tsx:3073-3075`,
`:2579-2581`):

```ts
const listed = locationId
  ? await listStations({ page: 1, limit: 100, locationId })
  : { stations: [] };
```

So **nothing prints at all** when:

- the outlet never created KDS stations (a very common single-printer venue),
- `activeLocationId` is empty (`CashierPage.tsx:283`),
- `listStations` returns empty, or throws (caught at `CashierPage.tsx:3072` /
  `:2578`, and nothing prints).

`SpaBoardPage` sidesteps the same case by silently doing nothing
(`src/pages/SpaBoardPage.tsx:1243`: `if (!listed.stations.length) return null;`).

**User-visible symptom:** “Send to kitchen” produces no paper and an unrouted
error, on a perfectly configured single-printer till.

**Suggested fix (not applied):** needs a product decision. Either (a) fall back to
a sector-checked `KDS` printer when the outlet has **no** stations at all, or
(b) keep strict mode and change the message from “unrouted items” to “no KDS
station configured”.

---

## 5. Findings — HIGH (routing rule violations)

### B3 · A printer set to `CHECKOUT` receives kitchen (KDS) tickets

**Rule broken:** CHECKOUT-only · **Flow impact:** yes

`resolveBindingsForPlace` falls back to the default printer regardless of sector
(`src/lib/pos/printerBindingStorage.ts:275-285`):

```ts
const bySector = bindingsForSector(bindings, place);
if (bySector.length) return uniquePhysicalPrinters(bySector);
if (defaultBinding) return [defaultBinding];              // ← sector-blind
const uniqueBindings = uniquePhysicalPrinters(bindings);
return uniqueBindings.length === 1 ? uniqueBindings : []; // ← sector-blind
```

and a default binding always exists (`printerBindingStorage.ts:124-127`).

It is reached from `printKitchen`'s non-strict rescue
(`usePrinterConnection.tsx:330-341`):

```ts
let jobs: PrinterJob[] = plan.jobs;
if (!options.requireStationRouting && !jobs.length && lines.length) {
  const localTargets = resolveBindingsForPlace(
    current.bindings, current.defaultBinding, "KDS"
  );
  ...
  jobs = targets.map((binding) => ({ binding, lines }));   // EVERY line, one printer
}
```

`AppShell` calls it with **no stations and no options**
(`src/widgets/layout/AppShell.tsx:588`):

```tsx
printKitchen={(slip) => printerConnection.printKitchen(slip)}
```

used by `RoomOrderAlerts` (`RoomOrderAlerts.tsx:61`). With `stations = []`,
`groupKitchenJobs` also takes the `bindingForLine` / `defaultBinding` path
(`routeKitchenPrint.ts:192-196`) — again sector-blind.

**User-visible symptom:** a room-tablet order, or any non-strict kitchen print,
lands on the till's checkout printer (the typical default). In the strict cashier
path the same fallback is disabled — which is why B1/B2 bite there instead.

**Pinned as intentional today** by
`src/lib/pos/__tests__/printerBindingStorage.test.ts:177-180`:

```ts
// Nothing bound to the section -> the default printer prints it.
expect(resolveBindingsForPlace([counter, office], counter, "KDS")).toEqual([counter]);
```

**Suggested fix (not applied):** put the policy in one place — either make
`resolveBindingsForPlace` sector-strict and give single-printer venues an explicit
sector on their printer, or keep the fallback but restrict it to the *same
document family* (KDS may fall back only to a printer whose sectors include `KDS`).
Either way this test changes.

---

### B4 · A printer set to `FINANCE` receives checkout bills

**Rule broken:** FINANCE-only · **Flow impact:** yes

Exact mirror of B3. On a register whose only binding is `FINANCE`-only,
`resolveBindingsForPlace(..., "CHECKOUT")` returns `[financeBinding]` via line 282
(or line 284 for a single printer). The customer's bill then prints on the office
printer.

The same shortcut is pinned at `printerBindingStorage.test.ts:181-182`
(“A single-printer venue prints everything, even without sector config.”).

Meanwhile `backendTargets` **does** filter by sector
(`usePrinterConnection.tsx:237-240`):

```ts
.filter((printer) => !printer.sectors?.length || printer.sectors.includes(place))
```

so the local-binding path and the backend path disagree about the same rule.

**Related, and documented as deliberate:** the *opposite* fallback — a finance
copy going to the till — is explicit at `usePrinterConnection.tsx:380-381`:

```ts
// The office copy goes to the till's own printer when there is no finance one.
if (!targets.length && slip.copy === "FINANCE") targets = await targetsFor("CHECKOUT");
```

That direction is labelled in the UI (`settings.printTemplate.copyFinance`, “…or
this one”) and tested (`usePrinterConnection.test.tsx:333-343`). Per the spec a
`FINANCE` copy landing on a `CHECKOUT` printer is also a rule violation — but it is
a *deliberate product choice*, so it is listed as a decision, not a defect.

---

### B5 · `printTicket` dumps the WHOLE ticket onto one station's printer

**Rule broken:** KDS station routing · **Flow impact:** yes

`routeKitchenPrint.ts:133-175` — the `stationId` branch:

```ts
return {
  jobs: stationBindings.map((binding) => ({ binding, lines, station })), // `lines` unfiltered
  unrouted: [],
  ...
};
```

`lines` is the entire ticket and `categoryIds` is ignored. So reprinting a mixed
ticket (e.g. from Counter orders) while the Beverages station is selected prints
the Chinese noodles and the French toast on the **beverage** printer as well.

Callers: `usePrinterConnection.tsx:454-489` (`printTicket`),
`CounterOrdersPage.tsx:155`, `SpaBoardPage.tsx:1216`.

When the ticket carries **no** `stationId`, the flow falls through to
`bindingForLine` → `defaultBinding` (`routeKitchenPrint.ts:103-115, 192-196`),
which is sector-blind (B3/B6).

**Mitigating factor:** the backend normally creates one ticket per station, so a
single-station ticket is safe; a whole-order ticket is not.

**Suggested fix (not applied):** filter `lines` by the station's `categoryIds`
inside the `stationId` branch and report the remainder as `unrouted` — i.e. reuse
`routeToStation` instead of the flat `jobs` map.

---

### B6 · `binding.categoryIds` is dead code — every line falls to the default printer

**Rule broken:** KDS · **Flow impact:** yes

`routeKitchenPrint.ts:103-115`:

```ts
const bindingForLine = (line, bindings, defaultBinding) => {
  if (line.categoryId) {
    const routed = bindings.find((binding) =>
      binding.categoryIds?.includes(line.categoryId || "")
    );
    if (routed) return routed;
  }
  return defaultBinding;
};
```

`PrinterBinding.categoryIds` is declared at `printerBindingStorage.ts:13` and read
here — but **nothing in the application ever writes it.** The only other
occurrence in `src/` is `categoryIds: []` for a synthetic station
(`usePrinterConnection.tsx:474`).

Printer-level category routing *does* exist (`KitchenPrinterService.ts:67-78`,
`useKitchenPrinterManagement.tsx:75-84`, endpoints in
`src/core/infrastructure/api/constants.ts`) but **no settings panel calls it** —
`attachCategory` / `detachCategory` appear only in tests.

Consequence: in the no-station path `bindingForLine` can never match, so the
default printer receives every line.

**Suggested fix (not applied):** either populate `categoryIds` on the binding when
the back-office printer list is read, or delete `bindingForLine` and make the
no-station path explicitly sector-checked.

---

## 6. Findings — HIGH (configuration data loss)

### B7 · Deleting a printer leaves dangling station routing

**Flow impact:** no

`PrinterSettingsPanel.remove()` (`src/pages/settings/PrinterSettingsPanel.tsx:318-333`):

```ts
if (selectedBackendId) await deletePrinter(selectedBackendId);
if (selectedBindingId) connection.removeBinding(selectedBindingId);
reset();
```

It never calls `syncStationAssignments(printerId, [])`. The KDS stations keep the
deleted id in `printerIds`, so `bindingsForStation` matches nothing and **every
category of that station becomes `unrouted` forever** — compounding B1/B2, and the
cashier keeps seeing “printer unavailable” with no way to clear it except editing
each station by hand.

**Suggested fix (not applied):** call `syncStationAssignments(id, [])` (and/or a
backend unassign) before deleting the printer record.

---

### B8 · Saving a printer can silently unassign it from ALL KDS stations

**Flow impact:** no

`selectBackendPrinter` seeds the station checkboxes from the hook's `stations`
state (`PrinterSettingsPanel.tsx:156-160`):

```ts
setStationIds(stations.filter((station) => station.printerIds.includes(printer.id)).map((s) => s.id));
```

`stations` loads asynchronously and errors are swallowed
(`PrinterSettingsPanel.tsx:113-121`, `.catch(() => undefined)`). If the operator
clicks a printer **before** that request lands (or it failed), `stationIds = []`
and **nothing re-seeds it** when the stations arrive. The fieldset then renders all
boxes unticked and enabled, and Save runs
(`:302-307` → `syncStationAssignments`, `:213-233`):

```ts
const shouldAssign = selectedStationIds.includes(station.id);   // false for every station
const printerIds = shouldAssign ? [...station.printerIds, printerId]
                                : station.printerIds.filter((id) => id !== printerId);
```

⇒ a PATCH per station that removes this printer ⇒ **shop-wide KDS routing is
destroyed by editing an unrelated field** (e.g. renaming the printer).

**Suggested fix (not applied):** derive the checkbox state from `stations` +
`selectedBackendId` at render time instead of copying it into state, and disable
Save (or the station fieldset) while `stationsLoading` is true / the list failed.

---

### B9 · A failed test print destroys a working printer configuration

**Flow impact:** no (but it stops printing)

Three separate problems in `PrinterSettingsPanel.save()`:

1. **Line 271 blocks all persistence for USB/Bluetooth printers:**

   ```ts
   if (transport !== "NETWORK" && (!connected || !verified)) return;
   ```

   This returns **before** `createPrinter` / `updatePrinter` (`:282-284`). On any
   device that cannot complete a test print (tablet, QZ Tray not running, WebUSB
   unsupported, popup blocked) a USB/Bluetooth printer can never be registered —
   so it never gets `sectors`, and `KdsStationSettingsPanel` (which only lists
   backend printers, `KdsStationSettingsPanel.tsx:54-60`) can never assign it to a
   station either.

2. **Lines 299-301 delete a working local binding when verification fails:**

   ```ts
   } else if (selectedBindingId) {
     connection.removeBinding(selectedBindingId);
   }
   ```

   A printer that was printing fine stops printing on this till after any failed
   test run, and on desktop (QZ) there is no `backendTargets` fallback to save it
   (`usePrinterConnection.tsx:228`: `if (!isBrowserPrinting()) return [];`).

3. **Line 280 writes a device-local opinion into a tenant-wide record:**

   ```ts
   isActive: connected,
   ```

   One till that cannot reach the printer marks the printer `isActive: false` for
   every register and outlet. On tablets `connected` can also be a false positive:
   with no native bridge, `canSendRawEscPos()` is false for NETWORK
   (`src/lib/printing/printerCapabilities.ts:16-20`), so the browser path "succeeds"
   without the printer ever being contacted (`BrowserPrinterClient.ts:118-150`).

**Suggested fix (not applied):** always persist `name`/`sectors`/`stationIds`;
treat the test print as advisory (store it on the local binding, not on the
tenant-wide `isActive`); never delete an existing binding because a test failed.

---

## 7. Findings — MEDIUM

### B10 · A printer with no sectors matches every print type

`usePrinterConnection.tsx:237-240` treats an empty sector list as “matches
everything”:

```ts
.filter((printer) => !printer.sectors?.length || printer.sectors.includes(place))
```

`ApiKitchenPrinterRepository.toPrinter` returns `[]` whenever the backend omits the
field (`ApiKitchenPrinterRepository.ts:34-40`), which is the case for any printer
created before sectors existed. Such a printer receives checkout + KDS + finance
documents.

**Flow impact:** yes (tightening this changes behaviour for legacy printers).

---

### B11 · Station printers are never validated to be `KDS` at print time

The UI filters candidate printers to sector `KDS`
(`KdsStationSettingsPanel.tsx:89-96`) and `PrinterSettingsPanel` strips station
assignments when KDS is unticked (`PrinterSettingsPanel.tsx:188, 302-307`). But the
router only matches `backendPrinterId` (`routeKitchenPrint.ts:31-41`) — it never
checks that the bound printer actually serves `KDS`. A station wired to a
`CHECKOUT` printer (legacy data, backend-created, or a printer whose sectors were
edited later) prints kitchen tickets there.

---

### B12 · Duplicate bindings for one physical printer ⇒ double print

`resolveBindingsForPlace` de-duplicates by physical printer
(`printerBindingStorage.ts:245-265`, `physicalPrinterKey` /
`uniquePhysicalPrinters`), and there is a test for it
(`printerBindingStorage.test.ts:187-207`). **Station routing does not.**
`bindingsForStation` + `planFromStations` use raw `bindings`
(`routeKitchenPrint.ts:31-41, 86-93`) and key jobs as
`` `${binding.id}:${station.id}` `` (`:89`), so an old local record plus a synced
backend record for the same printer produce **two jobs → the item prints twice on
the same machine**.

---

### B13 · Bindings fall back to another register's printers

`listStoredPrinterBindings` (`printerBindingStorage.ts:130-149`) returns the
current register's store when it has bindings, but otherwise scans **every**
`pos:printerBindings:*` key and uses the first non-empty store:

```ts
for (const key of storageKeys()) {
  if (!key.startsWith("pos:printerBindings:")) continue;
  ...
  if (found.bindings.length) return found;
}
```

Two consequences: till #2 inherits till #1's printers and sectors (documents print
at the wrong station), and — because the tenant id is part of the key but not part
of the prefix check — a shared browser profile can inherit a **different tenant's**
printer configuration.

---

### B14 · `missingPrinterRoutes` over-reports successful prints

`routeKitchenPrint.ts:68-94`: `missing.set(...)` runs for a station **before**
`printedOn` is consulted, so when one line's category matches two stations — one
bound, one not — the item prints correctly at station A **and** the cashier is told
station B's printer is unavailable (`cashier.errors.kdsPrinterUnavailable`,
`CashierPage.tsx:3101-3109`).

**Fix (not applied):** only record `missing` when the line ended up with no job at
all, or report it as a warning rather than an error.

---

### B15 · The shift report prints on the `CHECKOUT` printer

`src/lib/printing/shiftSlip.ts:9-13`:

```ts
export function shiftSlip(summary: ShiftSummary): SaleReceipt {
  return { title: "Shift report", place: "CHECKOUT", templateType: "SHIFT", ... };
```

An end-of-shift report is an office document, but it is routed as `CHECKOUT`
(via `useShiftPrinter.ts:17-20` → `printReceipt`), so it prints at the till and
never on a `FINANCE` printer. Whether that is intended is a product decision.

**Flow impact:** yes.

---

### B16 · Opening the Printer settings tab deletes bindings

`PrinterSettingsPanel.tsx:75-77` runs on mount:

```ts
useEffect(() => {
  removeLocalOnlyPrinterBindings(tenantId, activePosRegisterId || "");
}, [activePosRegisterId, tenantId]);
```

`removeLocalOnlyPrinterBindings` (`printerBindingStorage.ts:179-197`) deletes every
binding without a `backendPrinterId` and may reseat the default. Merely visiting
the tab is therefore a destructive repair step rather than an explicit action.

---

### B17 · A station PATCH echo can wipe `routingRules`, and the panel persists the wipe

1. `PrinterSettingsPanel.syncStationAssignments` PATCHes stations with only
   `{ printerIds }` (`:227-229`). `KdsStationService.update` forwards
   `routingRules: undefined` (`KdsStationService.ts:50-56`), which JSON
   serialisation drops — so the **request** is a correct partial update.
2. The **response** is re-mapped by `toStation`, which defaults
   `routingRules: { categoryIds }` to `[]` when the body omits it
   (`ApiKdsStationRepository.ts:26-46`), and `useKdsStationManagement` replaces the
   station in state with that object (`useKdsStationManagement.tsx:50-59`).
3. `KdsStationSettingsPanel.selectStation` copies
   `station.routingRules.categoryIds` into the draft (`:127`) and `save()` PATCHes
   `routingRules` unconditionally (`:138-147`).

So **if the backend's PATCH response does not echo `routingRules`, selecting that
station and pressing Save silently erases its menu-category routing** — after
which every one of its items is unrouted.

**Verify against the backend contract before fixing**; the severity depends on
whether `PATCH /kds/stations/:id` returns the full station.

---

### B18 · The KDS board is silently empty when the saved station was deleted

`src/pages/KdsPage.tsx:14-20, 30, 42`: the station id is read from `localStorage`
(`kds-station`) and passed straight to `refresh(stationId)`. If that station was
deleted or renamed away, the board filters to a non-existent station and shows
nothing, with no message telling the operator to re-choose.

---

## 8. Verified correct — do not "fix" these

1. **Happy-path station routing.** For the beer / noodles / toast example each item
   produces exactly one job on its own station's printer
   (`routeKitchenPrint.ts:55-65`), pinned by `routeKitchenPrint.test.ts:31-71`.
2. **Unmatched categories are not sprayed when at least one line routes**
   (`routeKitchenPrint.ts:65` + the `!jobs.length` guard in
   `usePrinterConnection.tsx:331`); pinned by `routeKitchenPrint.test.ts:104-125`
   and `usePrinterConnection.test.tsx:209-231`.
3. **Strict mode surfaces the failure instead of hiding it** — `unrouted` and
   `missingPrinterRoutes` reach the cashier (`CashierPage.tsx:3094-3112`).
4. **A category shared by two stations prints at both**, but only once per physical
   printer *record* (`routeKitchenPrint.ts:58-64, 86-93`; tests at
   `routeKitchenPrint.test.ts:214-256`).
5. **A station with several `printerIds` prints the station ticket on each**
   (`routeKitchenPrint.ts:86-93`).
6. **`copySlip`'s `place: "FINANCE"` is honoured** by `printOne`
   (`usePrinterConnection.tsx:378`, `receiptCopies.ts:18-29`): CUSTOMER +
   ORDER_RECEIPT go to `CHECKOUT`, FINANCE goes to `FINANCE`
   (`usePrinterConnection.test.tsx:319-331`). The finance copy also correctly drops
   logo/company/template.
7. **Copy order and defaults are safe** — guest first, unknown values dropped, an
   empty list means customer copy only (`receiptCopies.ts:7-13`); the domain default
   is `copies: ["CUSTOMER"]` (`PrintTemplate.ts:84`), so no venue prints finance
   copies by accident.
8. **`printableLines` cannot mis-route merged rows** — the merge key includes
   `categoryId` (`CashierPage.tsx:778-789`) and `categoryId` falls back to the menu
   lookup (`:766-767`).
9. **DELETE slips only print for lines the kitchen already received**, and a print
   failure never undoes the removal (`CashierPage.tsx:2571-2576, 2554-2558`).
10. **Blocked `localStorage` is mirrored in memory**, so a printer configured in this
    session still prints (`printerBindingStorage.ts:37-62`).
11. **An exact sector match always wins over the default printer**
    (`printerBindingStorage.ts:280-281`; `printerBindingStorage.test.ts:173-176`).
12. **Non-sale slips never fan out into copies** — card top-up/refund and the SPA
    check-bill print exactly one slip (`usePrinterConnection.tsx:421-424`).
13. **Layering complies with `AGENTS.md`** — no page imports `HttpClient`/Axios for
    printers or stations; everything goes through hooks and services.
14. **Read-side normalisation is sound** — sector whitelisting
    (`ApiKitchenPrinterRepository.ts:34-40`), tolerant station mapping
    (`ApiKdsStationRepository.ts:26-50`), service-level trim/dedupe
    (`KitchenPrinterService.ts:23-57`, `KdsStationService.ts:31-56`).

---

## 9. Tests pinned to behaviour that some fixes would change

These encode the current (spec-violating) fallbacks. Any fix in B3/B4/B10 must
update them deliberately — they are not accidents:

| Test | Pins |
| --- | --- |
| `src/lib/pos/__tests__/printerBindingStorage.test.ts:177-180` | “Nothing bound to the section → the default printer prints it” (KDS on a `CHECKOUT`-only printer) |
| `src/lib/pos/__tests__/printerBindingStorage.test.ts:181-182` | “A single-printer venue prints everything, even without sector config” |
| `src/core/presentation/hooks/__tests__/usePrinterConnection.test.tsx:262-277` | non-strict `printKitchen` falls back and prints |
| `src/core/presentation/hooks/__tests__/usePrinterConnection.test.tsx:333-343` | the finance copy goes to the till when no finance printer exists |

### Untested today (this is why B1/B5/B11/B12 were able to live)

- Stations configured, but **zero** bound station printers, in strict mode.
- `printTicket` with a ticket whose lines span several station categories.
- `printTicket` with an unknown / missing `stationId`.
- Two binding records for the same physical printer under station routing.
- A station whose `printerIds` point at a non-`KDS` printer.
- `printKitchen` when `listStations` throws.

---

## 10. Baseline test run

Run before any change, for regression comparison:

```
npm test -- src/lib/printing/__tests__/routeKitchenPrint.test.ts \
            src/core/presentation/hooks/__tests__/usePrinterConnection.test.tsx \
            src/lib/pos/__tests__/printerBindingStorage.test.ts
```

Result: **3 files passed, 38 tests passed** (routeKitchenPrint 18,
usePrinterConnection 12, printerBindingStorage 8). The bugs above are *not*
covered by these suites, which is why they are all green.

---

## 11. Decisions needed before any fix

These four questions change user-visible behaviour, so they need product sign-off.
**No changes have been made.**

| # | Decision | Options | Bugs affected |
| --- | --- | --- | --- |
| D1 | Should a single-printer venue (no sector match) still print everything? | (a) keep the convenience fallback; (b) make sectors strict and require every printer to declare its sectors | B3, B4, B10 |
| D2 | When an outlet has **no** KDS stations, should the kitchen ticket print on a `KDS`-sector printer? | (a) yes, fall back; (b) no, block and show “no KDS station configured” | B2 |
| D3 | Should the finance copy still fall back to the checkout printer when no `FINANCE` printer exists? | (a) keep (current, labelled in UI); (b) refuse and tell the operator | B4 |
| D4 | Should the shift report route to `FINANCE` instead of `CHECKOUT`? | (a) move to `FINANCE`; (b) keep on the till | B15 |

---

## 12. Suggested fix order (once approved)

Non-flow-changing, low-risk first:

1. **B7** — unassign stations when a printer is deleted.
2. **B8** — derive the station checkboxes instead of mirroring them into state;
   block Save while the station list is loading/failed.
3. **B9** — always persist `sectors`/`name`; stop deleting bindings on a failed
   test; stop writing `isActive` from one device's reachability.
4. **B16** — make binding cleanup an explicit action, not a mount side-effect.
5. **B12** — apply `uniquePhysicalPrinters` inside station routing.
6. **B14** — only report `missingPrinterRoutes` when nothing printed.
7. **B18** — fall back to “all stations” / prompt when the saved station is gone.

Then the flow-changing ones, with the D1–D4 answers applied:

8. **B1** — backend fallback for station `printerIds`.
9. **B2** — no-station behaviour (D2).
10. **B3 / B4 / B10** — sector policy in one place (D1, D3) + update the four
    pinned tests listed in §9.
11. **B5 / B6 / B11** — category filtering in the `stationId` branch; remove or
    wire up `bindingForLine`.
12. **B15** — shift report place (D4).
13. **B17** — verify the backend PATCH contract, then stop the draft from
    persisting an empty `routingRules`.

After each step: `npm run build` (per `AGENTS.md`) plus the three printing suites.

---

## Appendix A — reproduction recipes

**A1 · B1/B2 (no paper at all from the cashier)**
1. Settings → KDS Station: create “Beverages” with category *Beverages* and a
   `KDS` printer.
2. Clear the register's printer bindings (or use a second browser profile).
3. Cashier → add a beer → **Send to kitchen**.
4. Expected: beer prints at the beverage printer. Actual: no paper, cashier shows
   “No station for: …”.

**A2 · B5 (whole ticket on one station)**
1. Two stations: Beverages (`drink`) and Chinese (`chinese`), each with its printer.
2. Counter orders → open a ticket holding a beer **and** a Chinese noodle.
3. Print the ticket with the Beverages station selected.
4. Actual: the noodle prints on the beverage printer too.

**A3 · B3/B4 (wrong sector)**
1. Configure exactly one printer, sector `FINANCE`, and leave it as the default.
2. Complete a sale at the cashier and confirm the bill.
3. Actual: the customer bill prints on the finance printer (B4).
4. Mirror case: one printer with sector `CHECKOUT` set as default, then fire a room
   order from Room orders → the kitchen ticket prints on the checkout printer (B3).

**A4 · B8 (station routing wiped by an unrelated edit)**
1. Slow the network (DevTools throttling) and open Settings → Printer.
2. Immediately click an assigned KDS printer, change only its **name**, Save.
3. Actual: after the station list finally loads, all station checkboxes were empty
   at save time, so the printer is now unassigned from every station.

---

## Appendix B — evidence index

| Concern | Files |
| --- | --- |
| Station routing core | `src/lib/printing/routeKitchenPrint.ts` |
| Sector resolution / binding store | `src/lib/pos/printerBindingStorage.ts` |
| Print orchestration | `src/core/presentation/hooks/usePrinterConnection.tsx` |
| Receipt copies & template pick | `src/lib/printing/receiptCopies.ts`, `src/lib/printing/selectPrintTemplate.ts` |
| Slip formatting / `PrintPlace` | `src/lib/printing/formatKdsTicket.ts`, `src/lib/printing/shiftSlip.ts`, `src/lib/printing/reprintSlip.ts` |
| Cashier print paths | `src/pages/CashierPage.tsx` (712, 2336, 2571-2619, 3062-3130, 3444-3462) |
| Room / KTV / SPA / counter | `src/pages/KtvRoomPage.tsx:372`, `src/pages/SpaBoardPage.tsx:1216, 1244, 1701, 2030, 2073`, `src/pages/CounterOrdersPage.tsx:148-163`, `src/pages/SalesOrdersPage.tsx:259` |
| Shell-level kitchen print | `src/widgets/layout/AppShell.tsx:588`, `RoomOrderAlerts.tsx:61` |
| KDS board | `src/pages/KdsPage.tsx` |
| Printer settings | `src/pages/settings/PrinterSettingsPanel.tsx` |
| KDS station settings | `src/pages/settings/KdsStationSettingsPanel.tsx` |
| Print templates | `src/pages/settings/PrintTemplateSettingsPanel.tsx` |
| Backend mapping | `src/core/infrastructure/repositories/ApiKitchenPrinterRepository.ts`, `ApiKdsStationRepository.ts` |
| Domain / DTOs / services | `src/core/domain/entities/KitchenPrinter.ts`, `KdsStation.ts`, `src/core/application/dtos/*`, `src/core/application/services/KitchenPrinterService.ts`, `KdsStationService.ts` |
| Client runtimes | `src/core/infrastructure/printing/*` (`BrowserPrinterClient`, `QzTrayClient`, `MedianPrinterClient`, `getPrinterClient`, `PrinterClient`), `src/lib/printing/printerCapabilities.ts`, `webPrinterTransports.ts` |
