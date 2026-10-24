// Role-based access (PRD FR-75). The demo login issues an HMAC-signed token carrying {role, outlets};
// every route checks the role and the outlet scope on the server. The UI only hides what the server refuses.
// ponytail: demo login with no password (real authentication is a non-goal); tokens die on restart unless SESSION_SECRET is set.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Role = "customer" | "owner" | "admin";
export type Session = { role: Role; outlets: string[]; exp: number };

const secret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function issueToken(role: Role, outlets: string[], hours = 12) {
  const body = Buffer.from(JSON.stringify({ role, outlets, exp: Date.now() + hours * 3600_000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(header?: string): Session | undefined {
  const [body, sig] = (header?.replace(/^Bearer /, "") ?? "").split(".");
  if (!body || !sig) return;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return;
  const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  return s.exp > Date.now() ? s : undefined;
}

// Who may do what. Approvals stay with the owner: the admin sees them but never decides for an outlet.
export const POLICY = {
  availability: ["customer", "owner", "admin"],
  report: ["customer", "owner"],
  owner: ["owner", "admin"],
  run: ["owner", "admin"],
  approve: ["owner"],
  runs: ["owner", "admin"],
  admin: ["admin"],
} satisfies Record<string, Role[]>;

// Returns null when allowed, otherwise the HTTP status and message to send.
export function deny(s: Session | undefined, roles: Role[], outlet?: string): [number, string] | null {
  if (!s) return [401, "Sign in first (POST /login)"];
  if (!roles.includes(s.role)) return [403, `The ${s.role} role cannot do this`];
  if (outlet && !s.outlets.includes(outlet)) return [403, `No access to ${outlet}`];
  return null;
}
