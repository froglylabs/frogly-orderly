/**
 * How a DEX becomes a Frogly site ID.
 *
 * A DEX that already has a Frogly site passes its site ID in code. Every other
 * DEX gets a site ID derived from its Orderly broker ID: UUID version 5
 * (RFC 9562) of the name "orderly:" + brokerId in Frogly's namespace, computed
 * in the browser with SHA-1 from crypto.subtle. Frogly's server derives the
 * same value, so the two sides agree without any request.
 */

/** Frogly's UUID namespace for Orderly broker IDs. */
const NAMESPACE = "29de9c10-8411-4141-a9f0-8f30d0142eeb";

/** Shape of a site ID passed in code. */
const SITE_ID = /^[A-Za-z0-9_-]{8,80}$/;

/** Shape of a broker ID that can name a site. "demo" is Orderly's shared default. */
const BROKER_ID = /^[a-z0-9_-]{2,64}$/;

/** A site ID passed in code, or null when it is missing or malformed. */
export function siteIdFromOption(value: unknown): string | null {
  return typeof value === "string" && SITE_ID.test(value) ? value : null;
}

/** The broker ID trimmed and lowercased, or null when it cannot name a site. */
export function normalizeBrokerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const brokerId = value.trim().toLowerCase();
  if (!BROKER_ID.test(brokerId) || brokerId === "demo") return null;
  return brokerId;
}

/** True when the browser can compute a site ID. */
export function canHashSiteId(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

/** UUID version 5 of "orderly:" + brokerId, or null when crypto.subtle is missing. */
export async function siteIdForBroker(brokerId: string): Promise<string | null> {
  if (!canHashSiteId()) return null;
  const name = new TextEncoder().encode("orderly:" + brokerId);
  const input = new Uint8Array(16 + name.length);
  input.set(uuidBytes(NAMESPACE), 0);
  input.set(name, 16);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 9562 variant
  return uuidString(hash);
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function uuidString(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}
