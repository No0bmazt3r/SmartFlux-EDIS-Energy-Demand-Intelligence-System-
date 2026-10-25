// People (super admin): add franchise admins and other super admins, change roles and outlets, remove access.
// The server enforces every rule here; changes apply to live sessions at once.
import { useState } from "react";
import { api, usePrefs, useApi, type Role } from "./api.ts";
import { HqShell } from "./admin.tsx";
import { Dropdown, Failed, Icon, Loading, day, useToast } from "./ui.tsx";

type User = { id: number; name: string; email: string; role: Role; outlets: string[]; google: boolean; password: boolean; created_at: string };
type Outlet = { outlet_id: string; name: string };
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Runs the franchise outlets you pick: briefing, ask, approvals" },
  { value: "superadmin", label: "Super admin", hint: "Every outlet, the franchise dashboard and this People screen" },
  { value: "customer", label: "Customer", hint: "Sees outlets and free machines only" },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)!.label;

function PersonForm({ outlets, initial, onSave, onCancel }: { outlets: Outlet[]; initial?: User; onSave: (body: object) => Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? ""), [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "admin"), [picked, setPicked] = useState<string[]>(initial?.role === "admin" ? initial.outlets : []);
  const [password, setPassword] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await onSave({ name, email, role, outlets: role === "admin" ? picked : [], ...(password ? { password } : {}) }); }
    catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>
        <label className="field"><span className="label">Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <div className="field"><span className="label">Role</span>
          <Dropdown label="Role" value={role} onChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
          <span className="sm muted">{ROLES.find((r) => r.value === role)!.hint}</span></div>
        <label className="field"><span className="label">{initial ? "New password (optional)" : "Password"}</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="sm muted">{initial ? "Leave blank to keep it." : "At least 8 characters. Leave blank if they'll only sign in with Google."}</span></label>
      </div>
      {role === "admin" && <fieldset className="field"><legend className="label">Outlets they run</legend>
        <div className="row wrap">{outlets.map((o) => <button key={o.outlet_id} type="button" className="chip-btn" aria-pressed={picked.includes(o.outlet_id)} onClick={() => toggle(o.outlet_id)}>
          {picked.includes(o.outlet_id) && <Icon name="check" className="sm" />}{o.outlet_id} {o.name}</button>)}</div></fieldset>}
      {err && <p className="bad sm" role="alert"><Icon name="error" className="sm" /> {err}</p>}
      <div className="row"><button className="btn cta" disabled={busy}>{initial ? "Save changes" : "Add person"}</button>{onCancel && <button type="button" className="btn outlined" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}

export function PeopleApp() {
  const { session } = usePrefs(), toast = useToast();
  const people = useApi<User[]>("/users"), outlets = useApi<Outlet[]>("/outlets"), me = useApi<{ uid: number }>("/me");
  const [editing, setEditing] = useState<number | null>(null), [adding, setAdding] = useState(false);
  const save = (path: string, method: string, body?: object) =>
    fetch(path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.token}` }, body: body && JSON.stringify(body) })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); people.reload(); });
  const remove = async (u: User) => {
    if (!confirm(`Remove ${u.name} (${u.email})? They lose access straight away.`)) return;
    try { await save(`/users/${u.id}`, "DELETE"); toast.show(`${u.name} removed`); } catch (e) { toast.show((e as Error).message); }
  };
  const list = people.data ?? [];
  const staff = list.filter((u) => u.role !== "customer"), customers = list.filter((u) => u.role === "customer");
  const row = (u: User) => editing === u.id
    ? <li key={u.id} className="person editing"><PersonForm outlets={outlets.data ?? []} initial={u} onCancel={() => setEditing(null)}
        onSave={async (b) => { await save(`/users/${u.id}`, "PATCH", b); setEditing(null); toast.show(`${u.name} updated`); }} /></li>
    : <li key={u.id} className="person">
        <span className="avatar">{u.name[0]}</span>
        <span className="grow"><span className="row wrap"><b>{u.name}</b>{u.id === me.data?.uid && <span className="pill">You</span>}</span><span className="sm muted">{u.email}</span></span>
        <span className="person-meta"><span className={`pill ${u.role === "superadmin" ? "accent" : u.role === "admin" ? "info" : ""}`}>{roleLabel(u.role)}</span>
          <span className="sm muted">{u.role === "admin" ? u.outlets.join(", ") : "All outlets"}</span></span>
        <span className="person-meta sm muted">{[u.password && "Password", u.google && "Google"].filter(Boolean).join(" · ") || "No sign-in yet"}<br />Added {day(u.created_at)}</span>
        <span className="row"><button className="btn outlined sm-btn" onClick={() => setEditing(u.id)}>Edit</button>
          <button className="btn outlined sm-btn danger" disabled={u.id === me.data?.uid} title={u.id === me.data?.uid ? "You can't remove yourself" : undefined} onClick={() => remove(u)}>Remove</button></span>
      </li>;
  return (
    <HqShell crumb="People" actions={!adding && <button className="btn cta sm-btn" onClick={() => setAdding(true)}><Icon name="person_add" className="sm" />Add person</button>}>
      <div className="stack">
      <p className="muted">{staff.length} staff · {customers.length} {customers.length === 1 ? "customer" : "customers"}. Super admins see every outlet; an admin runs the franchise outlets you give them.</p>
      {adding && <section className="card glow"><h2 className="h3">Add a person</h2>
        <PersonForm outlets={outlets.data ?? []} onCancel={() => setAdding(false)} onSave={async (b) => { await save("/users", "POST", b); setAdding(false); toast.show("Added. They can sign in now."); }} /></section>}
      {people.error ? <Failed error={people.error} /> : !people.data ? <Loading /> : <>
        <section className="card"><h2 className="h3">Staff</h2><ul className="people">{staff.map(row)}</ul></section>
        <section className="card"><h2 className="h3">Customers</h2>{customers.length ? <ul className="people">{customers.map(row)}</ul> : <p className="sm muted">No customer accounts yet. Customers sign up on the sign-in screen.</p>}</section>
      </>}
      {toast.node}
      </div>
    </HqShell>
  );
}
