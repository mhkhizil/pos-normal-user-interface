import { HttpClient } from "../api/HttpClient";
import { API_ENDPOINTS } from "../api/constants";
import type { PriceCurrency } from "../../domain/entities/PrintTemplate";

export interface VenueSetting {
  paymentTiming: "PAY_WHEN_ORDERING" | "PAY_AT_END";
  /** Guests may order food and drinks during a SPA treatment. */
  spaMenuOrdering: boolean;
  /** Guests may order food and drinks in a KTV room. */
  ktvMenuOrdering: boolean;
  /** The money customers pay in. */
  currency: PriceCurrency;
  /** Sales check and deduct stock; off for a business without inventory. */
  trackStock: boolean;
  /** Removing an item or cancelling an order the kitchen has prints a DELETE slip. */
  kdsDeleteSlips: boolean;
  /**
   * The shop's default taxes as one rate, for taxable products with none of their
   * own: the fractions added up (0.05 for 5%), all inside the price or all on top.
   */
  defaultTaxRate: { id: string; rate: number; isPriceInclusive: boolean } | null;
  /** Every item is taxed at the default taxes, whatever it says itself; extra fees are not. */
  taxAllItems: boolean;
  /** Notes staff tap to add to an item ("No ice"), in the order set in Venue setup. */
  quickNotes: string[];
  /** Service charge in basis points, 1000 for 10%; 0 for none. */
  serviceChargeBps: number;
  serviceChargeOn: { BAR: boolean; SPA: boolean; KTV: boolean };
  /** The default taxes charged on the service charge, added up as a fraction. */
  serviceChargeTaxRate: number;
  /** Which areas charge tax; an area switched off charges none. */
  taxOn: { BAR: boolean; SPA: boolean; KTV: boolean };
  /** Which areas show the tax line on screen and on slips; tax is still charged. */
  taxShown: { BAR: boolean; SPA: boolean; KTV: boolean };
}

type RecordValue = Record<string, unknown>;

const asRecord = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};

const toRates = (data: RecordValue) => {
  const list = Array.isArray(data.defaultTaxRates)
    ? (data.defaultTaxRates as unknown[])
    : data.defaultTaxRate
      ? [data.defaultTaxRate]
      : [];
  return list
    .map(asRecord)
    .filter((rate) => rate.id && Number.isFinite(Number(rate.ratePercentage)));
};

const toDefaultTaxRate = (rates: RecordValue[]): VenueSetting["defaultTaxRate"] => {
  if (!rates.length) return null;
  return {
    id: String(rates[0].id),
    rate: rates.reduce((sum, rate) => sum + Number(rate.ratePercentage), 0),
    isPriceInclusive: rates[0].isPriceInclusive === true,
  };
};

/** The PUT replaces the venue record; send the current values back with the one change. */
const UPDATE_KEYS = [
  "spaEnabled",
  "spaMenuOrdering",
  "ktvEnabled",
  "ktvMenuOrdering",
  "paymentTiming",
  "roomCardOnly",
  "maxPromotionsPerItem",
  "maxPromotionsPerBill",
  "currency",
  "trackStock",
  "defaultTaxRateIds",
  "defaultTaxRateId",
  "taxAllItems",
  "serviceChargeBps",
  "serviceChargeOnBar",
  "serviceChargeOnSpa",
  "serviceChargeOnKtv",
] as const;

export class ApiVenueSettingRepository {
  constructor(private readonly httpClient: HttpClient) {}

  /** How this business takes payment for SPA and KTV rooms, from Venue setup. */
  async get(): Promise<VenueSetting> {
    return this.toSetting(await this.fetchData());
  }

  /**
   * Turns KDS DELETE slips on or off for the whole shop, keeping every other
   * venue setting as it is.
   */
  async updateKdsDeleteSlips(kdsDeleteSlips: boolean): Promise<VenueSetting> {
    const current = await this.fetchData();
    const payload: RecordValue = { kdsDeleteSlips };
    for (const key of UPDATE_KEYS) {
      if (current[key] !== undefined) payload[key] = current[key];
    }
    const response = asRecord(
      await this.httpClient.put<unknown>(API_ENDPOINTS.VENUE_SETTINGS.UPDATE, payload)
    );
    const updated = asRecord("data" in response ? response.data : response);
    return this.toSetting(
      Object.keys(updated).length ? updated : { ...current, kdsDeleteSlips }
    );
  }

  private async fetchData(): Promise<RecordValue> {
    const response = asRecord(
      await this.httpClient.get<unknown>(API_ENDPOINTS.VENUE_SETTINGS.GET)
    );
    return asRecord("data" in response ? response.data : response);
  }

  private toSetting(data: RecordValue): VenueSetting {
    const rates = toRates(data);
    return {
      paymentTiming: data.paymentTiming === "PAY_AT_END" ? "PAY_AT_END" : "PAY_WHEN_ORDERING",
      spaMenuOrdering: data.spaMenuOrdering !== false,
      ktvMenuOrdering: data.ktvMenuOrdering !== false,
      currency: data.currency === "USD" ? "USD" : "MMK",
      trackStock: data.trackStock !== false,
      kdsDeleteSlips: data.kdsDeleteSlips !== false,
      defaultTaxRate: toDefaultTaxRate(rates),
      taxAllItems: data.taxAllItems === true,
      quickNotes: Array.isArray(data.quickNotes)
        ? data.quickNotes.filter(
            (note): note is string => typeof note === "string" && note.trim() !== ""
          )
        : [],
      serviceChargeBps: Math.max(0, Number(data.serviceChargeBps) || 0),
      serviceChargeOn: {
        BAR: data.serviceChargeOnBar !== false,
        SPA: data.serviceChargeOnSpa !== false,
        KTV: data.serviceChargeOnKtv !== false,
      },
      serviceChargeTaxRate: rates
        .filter((rate) => rate.appliesToServiceCharge === true)
        .reduce((sum, rate) => sum + Number(rate.ratePercentage), 0),
      taxOn: {
        BAR: data.taxOnBar !== false,
        SPA: data.taxOnSpa !== false,
        KTV: data.taxOnKtv !== false,
      },
      taxShown: {
        BAR: data.taxShownBar !== false,
        SPA: data.taxShownSpa !== false,
        KTV: data.taxShownKtv !== false,
      },
    };
  }
}
