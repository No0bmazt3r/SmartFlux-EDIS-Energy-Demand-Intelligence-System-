// "Sign in with Google": the OAuth 2.0 authorization-code flow, server side, with plain fetch.
// On only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set (Google Cloud console → APIs & Services → Credentials →
// OAuth client ID, type "Web application", with GOOGLE_REDIRECT_URI as an authorised redirect URI).
// The ID token comes straight from Google's token endpoint over TLS, so its claims are checked (issuer, audience,
// expiry, verified email) without re-verifying the signature, as OpenID Connect Core §3.1.3.7 allows for this flow.
import { randomBytes } from "node:crypto";

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };
export function googleConfig(env: NodeJS.ProcessEnv): GoogleConfig | undefined {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI ?? "http://localhost:8000/auth/google/callback" };
}

export const STATE_COOKIE = "sf_oauth_state";
// The state value is also kept in an HttpOnly cookie, so a callback that this browser did not start is refused (CSRF).
export function googleStart(g: GoogleConfig) {
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: g.clientId, redirect_uri: g.redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  return { url: url.toString(), cookie: `${STATE_COOKIE}=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600` };
}

export const cookie = (header: string | undefined, name: string) => header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

export async function googleFinish(g: GoogleConfig, code: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: g.redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google refused the sign-in (${res.status})`);
  const idToken = (await res.json()).id_token as string | undefined;
  const claims = JSON.parse(Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString() || "{}");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw new Error("Unexpected token issuer");
  if (claims.aud !== g.clientId) throw new Error("Token was issued for another app");
  if (!(claims.exp * 1000 > Date.now())) throw new Error("Token expired");
  if (claims.email_verified !== true || typeof claims.email !== "string") throw new Error("Google account email is not verified");
  return { sub: String(claims.sub), email: claims.email as string, name: String(claims.name ?? "") };
}
