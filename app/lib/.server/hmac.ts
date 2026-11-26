/**
 * HMAC-SHA256 and a constant-time compare (Web Crypto: Workers and Node).
 * Used for Razorpay signatures and the follow-up tokens of /api/chat.
 */

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 of `message` with `secret`, as lowercase hex (Web Crypto: Workers and Node). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Compares two strings in time that does not depend on where they differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);

  let difference = a.length ^ b.length;

  for (let i = 0; i < length; i++) {
    difference |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }

  return difference === 0;
}
