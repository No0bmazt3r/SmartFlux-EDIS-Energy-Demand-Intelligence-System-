// Accounts (SQLite via node:sqlite) for the three roles: super admin (the business owner, every outlet, manages
// people), admin (runs the franchise outlets it is given) and customer (signs up to browse outlets).
// Passwords are scrypt hashes with a per-user salt; Google accounts are linked by their stable `sub`.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Role = "customer" | "admin" | "superadmin";
export const ROLES: Role[] = ["customer", "admin", "superadmin"];
export type User = { id: number; name: string; email: string; role: Role; outlets: string[]; google: boolean; password: boolean; created_at: string; created_by: number | null };
type Row = { id: number; name: string; email: string; role: Role; outlets: string; password_hash: string | null; google_sub: string | null; created_at: string; created_by: number | null };

const KEYLEN = 64;
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, KEYLEN).toString("base64")}`;
}
export function verifyPassword(password: string, stored: string | null) {
  const [kind, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64"), got = scryptSync(password, Buffer.from(salt, "base64"), KEYLEN);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export class UserError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export function openUsers(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('customer', 'admin', 'superadmin')),
    outlets TEXT NOT NULL DEFAULT '[]',
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by INTEGER
  )`);
  const pub = (r?: Row): User | undefined => r && ({ id: r.id, name: r.name, email: r.email, role: r.role, outlets: JSON.parse(r.outlets),
    google: !!r.google_sub, password: !!r.password_hash, created_at: r.created_at, created_by: r.created_by });
  const row = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as Row | undefined;

  // Checks shared by sign-up and the People screen. Customers and super admins see every outlet; an admin needs at least one.
  function clean(input: { name?: unknown; email?: unknown; role?: unknown; outlets?: unknown; password?: unknown }, all: string[], partial = false) {
    const out: { name?: string; email?: string; role?: Role; outlets?: string[]; password_hash?: string } = {};
    if (!partial || input.name !== undefined) {
      if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) throw new UserError(400, "Name is required (80 characters at most)");
      out.name = input.name.trim();
    }
    if (!partial || input.email !== undefined) {
      if (typeof input.email !== "string" || !EMAIL.test(input.email) || input.email.length > 120) throw new UserError(400, "Enter a valid email address");
      out.email = input.email.trim().toLowerCase();
    }
    if (!partial || input.role !== undefined) {
      if (!ROLES.includes(input.role as Role)) throw new UserError(400, `Role must be one of ${ROLES.join(", ")}`);
      out.role = input.role as Role;
    }
    if (input.password !== undefined && input.password !== "") {
      if (typeof input.password !== "string" || input.password.length < 8 || input.password.length > 200) throw new UserError(400, "Password must be at least 8 characters");
      out.password_hash = hashPassword(input.password);
    }
    if (out.role || input.outlets !== undefined) {
      const picked = Array.isArray(input.outlets) ? [...new Set(input.outlets.map(String))] : [];
      if (picked.some((o) => !all.includes(o))) throw new UserError(400, `Unknown outlet; pick from ${all.join(", ")}`);
      out.outlets = picked;
    }
    return out;
  }
  const scoped = (role: Role, outlets: string[], all: string[]) => {
    if (role !== "admin") return all;
    if (!outlets.length) throw new UserError(400, "An admin needs at least one outlet");
    return outlets;
  };

  const users = {
    count: () => (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
    list: () => (db.prepare("SELECT * FROM users ORDER BY role DESC, name").all() as Row[]).map((r) => pub(r)!),
    get: (id: number) => pub(row("SELECT * FROM users WHERE id = ?", id)),
    byEmail: (email: string) => pub(row("SELECT * FROM users WHERE email = ?", email)),

    create(input: Parameters<typeof clean>[0], all: string[], createdBy?: number) {
      const u = clean(input, all);
      if (users.byEmail(u.email!)) throw new UserError(409, "An account with that email already exists");
      const r = db.prepare("INSERT INTO users (name, email, role, outlets, password_hash, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .run(u.name!, u.email!, u.role!, JSON.stringify(scoped(u.role!, u.outlets ?? [], all)), u.password_hash ?? null, createdBy ?? null);
      return users.get(Number(r.lastInsertRowid))!;
    },

    // The People screen. A super admin cannot demote or delete themselves, and the last super admin always stays.
    update(id: number, input: Parameters<typeof clean>[0], all: string[], actor: number) {
      const cur = users.get(id);
      if (!cur) throw new UserError(404, "No such account");
      const u = clean(input, all, true);
      const role = u.role ?? cur.role;
      if (id === actor && role !== "superadmin") throw new UserError(400, "You cannot remove your own super admin role");
      if (u.email && u.email !== cur.email && users.byEmail(u.email)) throw new UserError(409, "An account with that email already exists");
      const outlets = scoped(role, u.outlets ?? (role === cur.role ? cur.outlets : []), all);
      db.prepare("UPDATE users SET name = ?, email = ?, role = ?, outlets = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?")
        .run(u.name ?? cur.name, u.email ?? cur.email, role, JSON.stringify(outlets), u.password_hash ?? null, id);
      return users.get(id)!;
    },

    remove(id: number, actor: number) {
      const cur = users.get(id);
      if (!cur) throw new UserError(404, "No such account");
      if (id === actor) throw new UserError(400, "You cannot delete your own account");
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    },

    // Email + password. The same message for a wrong email and a wrong password, so the form can't be used to find accounts.
    check(email: string, password: string) {
      const r = row("SELECT * FROM users WHERE email = ?", String(email));
      return r && verifyPassword(String(password), r.password_hash) ? pub(r) : undefined;
    },

    // Google: the stable `sub` first, then a verified email (an account a super admin created is linked on first use),
    // otherwise a new customer account.
    google(p: { sub: string; email: string; name: string }, all: string[]) {
      const bySub = pub(row("SELECT * FROM users WHERE google_sub = ?", p.sub));
      if (bySub) return bySub;
      const existing = users.byEmail(p.email);
      if (existing) { db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").run(p.sub, existing.id); return users.get(existing.id)!; }
      const created = users.create({ name: p.name || p.email.split("@")[0], email: p.email, role: "customer" }, all);
      db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").run(p.sub, created.id);
      return users.get(created.id)!;
    },
  };
  return users;
}
export type Users = ReturnType<typeof openUsers>;

// First start: a super admin from SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD, or, in sample mode only, the demo accounts
// listed in the README so a judge can sign in from a clean clone. Live mode never gets a default password.
export function seedUsers(users: Users, all: string[], env: NodeJS.ProcessEnv, sample: boolean) {
  if (users.count()) return [];
  if (env.SUPERADMIN_EMAIL && env.SUPERADMIN_PASSWORD) {
    return [users.create({ name: env.SUPERADMIN_NAME ?? "Owner", email: env.SUPERADMIN_EMAIL, role: "superadmin", password: env.SUPERADMIN_PASSWORD }, all)];
  }
  if (!sample) return [];
  const password = env.DEMO_PASSWORD ?? "smartflux-demo";
  return [
    users.create({ name: "Aisyah (owner)", email: "owner@smartflux.demo", role: "superadmin", password }, all),
    users.create({ name: "Hafiz (Ipoh franchise)", email: "ipoh@smartflux.demo", role: "admin", outlets: [all[0]], password }, all),
    users.create({ name: "Mei Ling (customer)", email: "customer@smartflux.demo", role: "customer", password }, all),
  ];
}
