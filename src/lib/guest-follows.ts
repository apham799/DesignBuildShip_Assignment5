// A guest's follows, kept in this browser tab only (sessionStorage), as in the
// Bucket List guest trial. They never reach the database: follows is signed-in
// only. When the guest signs up or signs in, useLiveConditions copies them into
// their account and clears this.

const KEY = "can-i-play:v1:guest-follows";

export function readGuestFollows(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeGuestFollows(ids: Iterable<string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {}
}

export function clearGuestFollows() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

// How many guest follows were just copied into the account. Kept in the tab until the
// person dismisses the message, so a remount during the sign-in redirect can't lose it.
const NOTICE_KEY = "can-i-play:v1:imported-notice";

export function writeImportedNotice(count: number) {
  try {
    sessionStorage.setItem(NOTICE_KEY, String(count));
  } catch {}
}

export function readImportedNotice(): number | null {
  try {
    const n = Number(sessionStorage.getItem(NOTICE_KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function clearImportedNotice() {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {}
}
