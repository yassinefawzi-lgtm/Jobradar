/**
 * Authentification mono-utilisateur : mot de passe unique (APP_PASSWORD) et cookie de session
 * signé HMAC-SHA256 (SESSION_SECRET). Fonctionne avec Web Crypto (proxy et serveur).
 */
export const SESSION_COOKIE = "jr_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum)");
  const payload = `v1.${now + SESSION_DAYS * 86_400_000}`;
  return `${payload}.${await hmac(s, payload)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  const s = secret();
  if (!s || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < now) return false;
  return timingSafeEqual(parts[2], await hmac(s, `${parts[0]}.${parts[1]}`));
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  const s = secret();
  if (!expected || !s) return false;
  // Comparaison à temps constant sur des empreintes de longueur fixe.
  return timingSafeEqual(await hmac(s, candidate), await hmac(s, expected));
}
