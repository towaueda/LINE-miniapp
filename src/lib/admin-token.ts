const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

// Token format: "{timestamp}.{hmac_hex}"
export async function generateAdminToken(secret: string): Promise<string> {
  const payload = Date.now().toString();
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bufferToHex(sig)}`;
}

export async function verifyAdminToken(token: string, secret: string): Promise<boolean> {
  if (!secret || !token) return false;
  try {
    const dotIndex = token.indexOf(".");
    if (dotIndex === -1) return false;

    const payload = token.substring(0, dotIndex);
    const sigHex = token.substring(dotIndex + 1);

    // Validate timestamp
    const timestamp = parseInt(payload, 10);
    if (isNaN(timestamp)) return false;
    const age = Date.now() - timestamp;
    if (age < 0 || age > TOKEN_TTL_MS) return false;

    // Verify HMAC signature (constant-time via subtle.verify)
    const key = await getKey(secret);
    return crypto.subtle.verify(
      "HMAC",
      key,
      hexToBuffer(sigHex),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}
