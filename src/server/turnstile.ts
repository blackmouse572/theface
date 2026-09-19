const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verifies a Turnstile token server-side. The widget alone protects nothing. */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!token) return false;

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    const result = (await res.json()) as { success: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
