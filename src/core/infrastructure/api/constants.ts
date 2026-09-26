const PRODUCTION_API_URL = "https://apivision.winterarc.asia";

const resolveApiOrigin = (): string =>
  String(import.meta.env.VITE_API_URL || PRODUCTION_API_URL)
    .trim()
    .replace(/\/+$/, "") || PRODUCTION_API_URL;

const resolveApiBaseUrl = (): string => {
  if (import.meta.env.DEV) {
    // Same-origin in dev so the Vite proxy can handle CORS.
    return "";
  }

  return resolveApiOrigin();
};

export const API_CONFIG = {
  BASE_URL: resolveApiBaseUrl(),
  MEDIA_BASE_URL: resolveApiOrigin(),
} as const;

export const resolveMediaUrl = (value: unknown): string | undefined => {
  if (value == null || String(value).trim() === "") return undefined;
  const url = String(value).trim();
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${API_CONFIG.MEDIA_BASE_URL}${path}`;
};

/**
 * Template endpoint map.
 * Replace paths with your backend contract when starting a new project.
 */
export const API_ENDPOINTS = {
  ROOT: "/",

  AUTH: {
    SIGNIN: "/api/v1/auth/signin",
    SESSION: "/api/v1/auth/session",
    SET_ACTIVE_BRANCH: "/api/v1/auth/set-active-branch",
  },

  USERS: {
    BASE: "/api/v1/users",
    CREATE: "/api/v1/users",
    GET_BY_ID: "/api/v1/users/by-id",
    GET_LIST: "/api/v1/users",
    UPDATE: "/api/v1/users/update",
    UPDATE_PROFILE: "/api/v1/users/profile",
    UPLOAD_PROFILE_IMAGE: "/api/v1/users/upload-profile-image",
    DELETE: (id: string) => `/api/v1/users/${id}`,
  },

  CUSTOMERS: {
    LIST: "/api/v1/customers",
    CREATE: "/api/v1/customers",
    BY_ID: (id: string) => `/api/v1/customers/${id}`,
    UPDATE: (id: string) => `/api/v1/customers/${id}`,
    DELETE: (id: string) => `/api/v1/customers/${id}`,
    INTERACTIONS: (customerId: string) => ({
      LIST: `/api/v1/customers/${customerId}/interactions`,
      CREATE: `/api/v1/customers/${customerId}/interactions`,
      BY_ID: (id: string) =>
        `/api/v1/customers/${customerId}/interactions/${id}`,
      UPDATE: (id: string) =>
        `/api/v1/customers/${customerId}/interactions/${id}`,
      DELETE: (id: string) =>
        `/api/v1/customers/${customerId}/interactions/${id}`,
    }),
    MEMBERSHIP_CARD: (customerId: string) => ({
      GET: `/api/v1/customers/${customerId}/membership-card`,
      TOPUP: `/api/v1/customers/${customerId}/membership-card/topup`,
      REFUND: `/api/v1/customers/${customerId}/membership-card/refund`,
      BIND: `/api/v1/customers/${customerId}/membership-card/bind`,
      UNBIND: `/api/v1/customers/${customerId}/membership-card/unbind`,
      CLOSE: `/api/v1/customers/${customerId}/membership-card/close`,
    }),
  },

  MEMBERSHIP_CARDS: {
    DETECT: "/api/v1/membership-cards/detect",
    VERIFY_PIN: "/api/v1/membership-cards/verify-pin",
    TOPUP: "/api/v1/membership-cards/topup",
    REFUND: "/api/v1/membership-cards/refund",
    TOPUP_AMOUNT_OPTIONS: "/api/v1/membership-card-topup-amounts",
    REFUND_AMOUNT_OPTIONS: "/api/v1/membership-card-refund-amounts",
    TOPUP_RECEIPT: "/api/v1/membership-cards/topup-receipt",
    REFUND_RECEIPT: "/api/v1/membership-cards/refund-receipt",
  },

  CUSTOMER_INTERACTIONS: {
    LIST: "/api/v1/customer-interactions",
    BY_ID: (id: string) => `/api/v1/customer-interactions/${id}`,
  },

  GUEST_WALLETS: {
    LIST: "/api/v1/guest-wallets",
    CREATE: "/api/v1/guest-wallets",
    BY_ID: (id: string) => `/api/v1/guest-wallets/${id}`,
    CARDS: (id: string) => `/api/v1/guest-wallets/${id}/cards`,
    LEDGER: (id: string) => `/api/v1/guest-wallets/${id}/ledger`,
    AUDIT: (id: string) => `/api/v1/guest-wallets/${id}/audit`,
    TOP_UP: (id: string) => `/api/v1/guest-wallets/${id}/top-up`,
    SETTLEMENT_QUOTE: (id: string) =>
      `/api/v1/guest-wallets/${id}/settlement-quote`,
    BEGIN_SETTLEMENT: (id: string) =>
      `/api/v1/guest-wallets/${id}/begin-settlement`,
    CANCEL_SETTLEMENT: (id: string) =>
      `/api/v1/guest-wallets/${id}/cancel-settlement`,
    SETTLE: (id: string) => `/api/v1/guest-wallets/${id}/settle`,
    REFUND: (id: string) => `/api/v1/guest-wallets/${id}/refund`,
    VOID: (id: string) => `/api/v1/guest-wallets/${id}/void`,
  },

  GUEST_CARDS: {
    LOOKUP: "/api/v1/guest-cards/lookup",
    LIST: "/api/v1/guest-cards",
    CREATE: "/api/v1/guest-cards",
    BY_ID: (id: string) => `/api/v1/guest-cards/${id}`,
    DELETE: (id: string) => `/api/v1/guest-cards/${id}`,
    REPORT_LOST: (id: string) => `/api/v1/guest-cards/${id}/report-lost`,
    REPLACE: (id: string) => `/api/v1/guest-cards/${id}/replace`,
  },

  LOCATIONS: {
    LIST: "/api/v1/locations",
    TREE: "/api/v1/locations/tree",
    BY_ID: (id: string) => `/api/v1/locations/${id}`,
  },

  PRODUCTS: {
    LIST: "/api/v1/products",
    BY_ID: (id: string) => `/api/v1/products/${id}`,
    VARIANTS: (productId: string) => ({
      LIST: `/api/v1/products/${productId}/variants`,
      BY_ID: (id: string) => `/api/v1/products/${productId}/variants/${id}`,
    }),
  },

  SALES_ORDERS: {
    LIST: "/api/v1/sales-orders",
    BY_ID: (id: string) => `/api/v1/sales-orders/${id}`,
    CREATE: "/api/v1/sales-orders",
    UPDATE: (id: string) => `/api/v1/sales-orders/${id}`,
    DELETE: (id: string) => `/api/v1/sales-orders/${id}`,
    SETTLE: (id: string) => `/api/v1/sales-orders/${id}/settle`,
    LINES: (salesOrderId: string) => ({
      LIST: `/api/v1/sales-orders/${salesOrderId}/lines`,
      CREATE: `/api/v1/sales-orders/${salesOrderId}/lines`,
      BY_ID: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}`,
      UPDATE: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}`,
      DELETE: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}`,
      FIRE: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}/fire`,
      READY: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}/ready`,
      SERVE: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}/serve`,
      VOID: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}/void`,
      COMP: (lineId: string) =>
        `/api/v1/sales-orders/${salesOrderId}/lines/${lineId}/comp`,
    }),
    PAYMENTS: (salesOrderId: string) => ({
      LIST: `/api/v1/sales-orders/${salesOrderId}/payments`,
      CREATE: `/api/v1/sales-orders/${salesOrderId}/payments`,
    }),
  },

  CHECKOUT: {
    PROCESS: "/api/v1/checkout",
    VOID: (id: string) => `/api/v1/checkout/${id}/void`,
  },

  PAYMENT_METHODS: {
    LIST: "/api/v1/payment-methods",
    BY_ID: (id: string) => `/api/v1/payment-methods/${id}`,
  },

  POS_REGISTERS: {
    LIST: "/api/v1/pos-registers",
    CREATE: "/api/v1/pos-registers",
    BY_ID: (id: string) => `/api/v1/pos-registers/${id}`,
    UPDATE: (id: string) => `/api/v1/pos-registers/${id}`,
    DELETE: (id: string) => `/api/v1/pos-registers/${id}`,
  },

  POS_SESSIONS: {
    LIST: "/api/v1/pos-sessions",
    CREATE: "/api/v1/pos-sessions",
    BY_ID: (id: string) => `/api/v1/pos-sessions/${id}`,
    UPDATE: (id: string) => `/api/v1/pos-sessions/${id}`,
    DELETE: (id: string) => `/api/v1/pos-sessions/${id}`,
    CLOSE: (id: string) => `/api/v1/pos-sessions/${id}/close`,
    SUMMARY: (id: string) => `/api/v1/pos-sessions/${id}/summary`,
  },

  DINING_ZONES: {
    LIST: "/api/v1/dining-zones",
  },

  DINING_TABLES: {
    LIST: "/api/v1/dining-tables",
    UPDATE_STATUS: (id: string) => `/api/v1/dining-tables/${id}/status`,
  },

  TABLE_SESSIONS: {
    LIST: "/api/v1/table-sessions",
    CREATE: "/api/v1/table-sessions",
    BY_ID: (id: string) => `/api/v1/table-sessions/${id}`,
    STATE: (id: string) => `/api/v1/table-sessions/${id}/state`,
    LINES: (id: string) => `/api/v1/table-sessions/${id}/lines`,
    CHECKOUT: (id: string) => `/api/v1/table-sessions/${id}/checkout`,
  },

  KTV_ROOMS: {
    LIST: "/api/v1/ktv-rooms",
    CREATE: "/api/v1/ktv-rooms",
    BOARD: "/api/v1/ktv-rooms/board",
    BY_ID: (id: string) => `/api/v1/ktv-rooms/${id}`,
    UPDATE: (id: string) => `/api/v1/ktv-rooms/${id}`,
    DELETE: (id: string) => `/api/v1/ktv-rooms/${id}`,
    READY: (id: string) => `/api/v1/ktv-rooms/${id}/ready`,
  },

  KTV_SESSIONS: {
    CREATE: "/api/v1/ktv-sessions",
    QUOTE: (id: string) => `/api/v1/ktv-sessions/${id}/quote`,
    PAUSE: (id: string) => `/api/v1/ktv-sessions/${id}/pause`,
    RESUME: (id: string) => `/api/v1/ktv-sessions/${id}/resume`,
    CLOSE: (id: string) => `/api/v1/ktv-sessions/${id}/close`,
  },
  SPA_ROOMS: {
    CREATE: "/api/v1/spa-rooms",
    BOARD: "/api/v1/spa-rooms/board",
    UPDATE: (id: string) => `/api/v1/spa-rooms/${id}`,
    DELETE: (id: string) => `/api/v1/spa-rooms/${id}`,
    READY: (id: string) => `/api/v1/spa-rooms/${id}/ready`,
  },

  SPA_SESSIONS: {
    CREATE: "/api/v1/spa-sessions",
    QUOTE: (id: string) => `/api/v1/spa-sessions/${id}/quote`,
    PAUSE: (id: string) => `/api/v1/spa-sessions/${id}/pause`,
    RESUME: (id: string) => `/api/v1/spa-sessions/${id}/resume`,
    CLOSE: (id: string) => `/api/v1/spa-sessions/${id}/close`,
    EXTEND: (id: string) => `/api/v1/spa-sessions/${id}/extend`,
    CHARGES: (id: string) => `/api/v1/spa-sessions/${id}/charges`,
    REFUND_LINE: (id: string, lineId: string) =>
      `/api/v1/spa-sessions/${id}/lines/${lineId}/refund`,
  },
  ROOM_TABLET: {
    MENU: "/api/v1/room-tablet/menu",
    SESSION: "/api/v1/room-tablet/session",
  },

  KDS: {
    FIRE: "/api/v1/kds/fire",
    TICKETS: "/api/v1/kds/tickets",
    TICKET: (id: string) => `/api/v1/kds/tickets/${id}`,
    STATIONS: "/api/v1/kds/stations",
    STATION: (id: string) => `/api/v1/kds/stations/${id}`,
  },

  CATEGORIES: {
    LIST: "/api/v1/categories",
    TREE: "/api/v1/categories/tree",
    BY_ID: (id: string) => `/api/v1/categories/${id}`,
  },

  KITCHEN_PRINTERS: {
    LIST: "/api/v1/kitchen-printers",
    CREATE: "/api/v1/kitchen-printers",
    BY_ID: (id: string) => `/api/v1/kitchen-printers/${id}`,
    UPDATE: (id: string) => `/api/v1/kitchen-printers/${id}`,
    DELETE: (id: string) => `/api/v1/kitchen-printers/${id}`,
    ATTACH_CATEGORY: (id: string) =>
      `/api/v1/kitchen-printers/${id}/categories`,
    DETACH_CATEGORY: (id: string, categoryId: string) =>
      `/api/v1/kitchen-printers/${id}/categories/${categoryId}`,
  },

  DISCOUNT_REASONS: {
    LIST: "/api/v1/discount-reasons",
  },

  VOID_REASONS: {
    LIST: "/api/v1/void-reasons",
  },

  WAITLIST: {
    LIST: "/api/v1/waitlist",
    CREATE: "/api/v1/waitlist",
    BY_ID: (id: string) => `/api/v1/waitlist/${id}`,
    UPDATE: (id: string) => `/api/v1/waitlist/${id}`,
    NOTIFY: (id: string) => `/api/v1/waitlist/${id}/notify`,
    SEAT: (id: string) => `/api/v1/waitlist/${id}/seat`,
    CANCEL: (id: string) => `/api/v1/waitlist/${id}/cancel`,
    NO_SHOW: (id: string) => `/api/v1/waitlist/${id}/no-show`,
  },

  REPORTS: {
    SALES_SUMMARY: "/api/v1/reports/sales-summary",
    ITEM_SALES: "/api/v1/reports/item-sales",
    SALES_BY_CATEGORY: "/api/v1/reports/sales-by-category",
    SALES_BY_ITEM: "/api/v1/reports/sales-by-item",
    Z_REPORT: "/api/v1/reports/z-report",
  },

  PRINT_TEMPLATES: {
    LIST: "/api/v1/print-templates",
    CREATE: "/api/v1/print-templates",
    RESOLVE: "/api/v1/print-templates/resolve",
    BY_ID: (id: string) => `/api/v1/print-templates/${id}`,
    UPDATE: (id: string) => `/api/v1/print-templates/${id}`,
    DELETE: (id: string) => `/api/v1/print-templates/${id}`,
  },

  TIP_POOLS: {
    LIST: "/api/v1/tip-pools",
    CREATE: "/api/v1/tip-pools",
    BY_ID: (id: string) => `/api/v1/tip-pools/${id}`,
    UPDATE: (id: string) => `/api/v1/tip-pools/${id}`,
    DISTRIBUTE: (id: string) => `/api/v1/tip-pools/${id}/distribute`,
    SETTLE: (id: string) => `/api/v1/tip-pools/${id}/settle`,
    ALLOCATIONS: {
      LIST: (id: string) => `/api/v1/tip-pools/${id}/allocations`,
      CREATE: (id: string) => `/api/v1/tip-pools/${id}/allocations`,
      UPDATE: (id: string, allocationId: string) =>
        `/api/v1/tip-pools/${id}/allocations/${allocationId}`,
      DELETE: (id: string, allocationId: string) =>
        `/api/v1/tip-pools/${id}/allocations/${allocationId}`,
    },
  },

  COUNTER_ORDERS: {
    BY_ID: (id: string) => `/api/v1/counter-orders/${id}`,
    PICKUP: (id: string) => `/api/v1/counter-orders/${id}/pickup`,
  },

  // Placeholder until backend publishes a table occupancy warning-policy contract.
  TABLE_WARNING: {
    POLICY: "/api/v1/table-warning-policy",
  },

  // Placeholder POS sync endpoints — replace when backend contract is confirmed.
  POS_SYNC: {
    PULL_SETTINGS: "/api/v1/pos-sync/settings/pull",
    PULL_ITEMS: "/api/v1/pos-sync/items/pull",
    UPLOAD_ORDERS: "/api/v1/pos-sync/orders/upload",
    RESTART_SERVICE: "/api/v1/pos-sync/service/restart",
    STATUS: "/api/v1/pos-sync/status",
  },

  CSRF: {
    TOKEN: "/csrf/token",
  },
} as const;

export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
} as const;

export type ApiEndpoint = typeof API_ENDPOINTS;
export type HttpMethod = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];
