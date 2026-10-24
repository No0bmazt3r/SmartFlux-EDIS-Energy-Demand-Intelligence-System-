// Role-based access (PRD FR-75). Sign-in issues an HMAC-signed token; every route checks the role and the outlet
// scope on the server, and the UI only hides what the server refuses. A token for an account is re-read from the
// users table on every request, so removing someone or changing their role applies at once.
// Set SESSION_SECRET in production: without it tokens die on restart.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role, Users } from "./users.ts";

export type { Role };
// uid is absent for a guest customer who scanned an outlet's QR code without an account.
export type Session = { uid?: number; role: Role; outlets: string[]; name?: string; email?: string; exp: number };

const secret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function issueToken(role: Role, outlets: string[], uid?: number, hours = 12) {
  const body = Buffer.from(JSON.stringify({ uid, role, outlets, exp: Date.now() + hours * 3600_000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(header?: string, users?: Users): Session | undefined {
  const [body, sig] = (header?.replace(/^Bearer /, "") ?? "").split(".");
  if (!body || !sig) return;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return;
  const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  if (s.exp <= Date.now()) return;
  if (s.uid == null || !users) return s;
  const u = users.get(s.uid);
  return u && { uid: u.id, role: u.role, outlets: u.outlets, name: u.name, email: u.email, exp: s.exp };
}

// Who may do what. The super admin is the business owner (every outlet); an admin runs the franchise outlets it was
// given, approvals included; customers see availability and promos only.
export const POLICY = {
  availability: ["customer", "admin", "superadmin"],
  report: ["customer", "admin", "superadmin"],
  owner: ["admin", "superadmin"],
  run: ["admin", "superadmin"],
  approve: ["admin", "superadmin"],
  runs: ["admin", "superadmin"],
  franchise: ["superadmin"],
  people: ["superadmin"],
  me: ["customer", "admin", "superadmin"],
} satisfies Record<string, Role[]>;

// Returns null when allowed, otherwise the HTTP status and message to send.
export function deny(s: Session | undefined, roles: Role[], outlet?: string): [number, string] | null {
  if (!s) return [401, "Sign in first (POST /login)"];
  if (!roles.includes(s.role)) return [403, `The ${s.role} role cannot do this`];
  if (outlet && !s.outlets.includes(outlet)) return [403, `No access to ${outlet}`];
  return null;
}

// Slows password guessing: five wrong passwords for one email lock it for 15 minutes.
// ponytail: in-memory per process, so a restart resets it; a shared store if this ever runs on several servers.
const failures = new Map<string, { n: number; until: number }>();
export const lockedOut = (email: string) => (failures.get(email.toLowerCase())?.until ?? 0) > Date.now();
export function noteLogin(email: string, ok: boolean) {
  const k = email.toLowerCase();
  if (ok) return failures.delete(k);
  const f = failures.get(k) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.n = 0; f.until = Date.now() + 15 * 60_000; }
  failures.set(k, f);
}
