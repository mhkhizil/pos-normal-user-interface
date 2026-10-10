import packageJson from "../../package.json";

/**
 * The released app version, from package.json.
 *
 * Bump `version` in package.json to "count" a release (e.g. 1.0.0 -> 1.0.1 for a
 * patch, 1.1.0 for a feature, 2.0.0 for a breaking change). It is the single
 * source of truth and is shown on the login screen and in the POS shell.
 */
export const APP_VERSION = String(packageJson.version || "0.0.0");
