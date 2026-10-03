/** Fixed sync settings (docs/adr/0011). The app key is public by design: PKCE has no secret. */

export const DROPBOX_APP_KEY = "REPLACE_WITH_APP_KEY";

/** The App Folder users see in their Dropbox: Apps/<the app's name in the Dropbox console>. */
export const DROPBOX_FOLDER = "Apps/Notes and Goals";

/** The Mac's one-shot loopback listener (Rust `oauth_wait_for_code`). */
export const LOOPBACK_PORT = 53682;
export const MAC_REDIRECT_URI = `http://localhost:${LOOPBACK_PORT}/callback`;

/** The phone app redirects back to its own page; registered per origin in the Dropbox console. */
export const webRedirectUri = (): string => `${location.origin}${location.pathname}`;

/** What the phone syncs: entity files only, never attachments/ or .atlas/. */
export const PHONE_INCLUDE = (path: string): boolean =>
  /^(tasks|notes|goals|notebooks)\/[^/]+$/.test(path);

/** What the Mac syncs: the whole data folder minus OS litter and temp files. */
export const MAC_INCLUDE = (path: string): boolean => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return !(name.endsWith(".tmp") || name === ".DS_Store" || name === "Icon\r");
};
