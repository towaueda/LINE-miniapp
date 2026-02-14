import type Liff from "@line/liff";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "";

let liff: typeof Liff | null = null;

export function getLiff() {
  return liff;
}

export async function initLiff(): Promise<boolean> {
  if (!LIFF_ID) {
    console.log("LIFF ID not set — running in mock mode");
    return false;
  }
  try {
    const mod = await import("@line/liff");
    liff = mod.default;
    await liff.init({ liffId: LIFF_ID });
    return true;
  } catch (e) {
    console.error("LIFF init failed:", e);
    return false;
  }
}

export function liffLogin() {
  if (!liff) return;
  if (liff.isInClient() || liff.isLoggedIn()) return;
  liff.login();
}

export async function getLiffProfile() {
  if (!liff) return null;
  try {
    if (liff.isLoggedIn()) {
      return await liff.getProfile();
    }
  } catch {
    // fall through
  }
  return null;
}
