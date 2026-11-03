import { useEffect, useState } from "react";
import container from "../../infrastructure/di/container";
import type {
  ApiVenueSettingRepository,
  VenueSetting,
} from "../../infrastructure/repositories/ApiVenueSettingRepository";

const PAY_WHEN_ORDERING: VenueSetting = {
  paymentTiming: "PAY_WHEN_ORDERING",
  spaMenuOrdering: true,
  ktvMenuOrdering: true,
  currency: "MMK",
  trackStock: true,
  kdsDeleteSlips: true,
  defaultTaxRate: null,
  taxAllItems: false,
  quickNotes: [],
  serviceChargeBps: 0,
  serviceChargeOn: { BAR: true, SPA: true, KTV: true },
  serviceChargeTaxRate: 0,
};

/**
 * When guests pay for SPA and KTV rooms. Until it loads, the till behaves as it
 * always has (pay when ordering), and the server refuses anything the setting
 * does not allow.
 */
export function useVenueSetting() {
  const [setting, setSetting] = useState<VenueSetting>(PAY_WHEN_ORDERING);

  useEffect(() => {
    let cancelled = false;
    container
      .resolve<ApiVenueSettingRepository>("venueSettingRepository")
      .get()
      .then((loaded) => {
        if (!cancelled) setSetting(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return setting;
}
