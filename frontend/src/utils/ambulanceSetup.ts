/**
 * Helpers for the ambulance phone setup hand-off. The admin registers an
 * ambulance, the server reveals the login ID + password once, and we turn that
 * into a QR code the driver's phone scans to sign in — no typing on the phone.
 *
 * The QR payload is a small JSON object the Flutter app parses:
 *   { "v": 1, "url": <server>, "id": <login_id>, "pw": <password> }
 */

/** The public origin the driver's phone should talk to. Same host that serves
 *  this console, unless the API base URL is an absolute URL on another host. */
export const driverServerUrl = (): string => {
  const base = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
  try {
    if (/^https?:\/\//i.test(base)) return new URL(base).origin;
  } catch {
    /* fall through to the window origin */
  }
  return window.location.origin;
};

export interface AmbulanceSetupPayload {
  serverUrl: string;
  loginId: string;
  password: string;
}

/** The string encoded into the setup QR code. Kept compact and stable — the
 *  Flutter login screen reads exactly these keys. */
export const buildSetupQr = ({ serverUrl, loginId, password }: AmbulanceSetupPayload): string =>
  JSON.stringify({ v: 1, url: serverUrl, id: loginId, pw: password });
