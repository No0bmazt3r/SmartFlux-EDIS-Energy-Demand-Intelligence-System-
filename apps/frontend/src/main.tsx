// One app, three roles. The role from the demo login decides which screens exist; the server enforces the same rules.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, navigate, setPref, usePath, usePrefs, useApi, type Role, type Session } from "./api.ts";
import { AdminApp } from "./admin.tsx";
import { CustomerApp } from "./customer.tsx";
import { OwnerApp } from "./owner.tsx";
import { Failed, Icon } from "./ui.tsx";
import "./styles.css";

const HOME: Record<Role, string> = { customer: "/customer", owner: "/", admin: "/admin" };
const allowed = (role: Role, path: string) =>
  role === "customer" ? path.startsWith("/customer") : role === "admin" ? path.startsWith("/admin") : !path.startsWith("/admin") && !path.startsWith("/customer") && !path.startsWith("/login");

async function signIn(role: Role, outlet_id?: string) {
  const s = await api<Session>("/login", { role, outlet_id });
  setPref("session", s);
  setPref("outlet", s.outlets[0]);
  navigate(HOME[role], true);
}

function Login() {
  const outlets = useApi<{ outlet_id: string; name: string }[]>("/outlets");
  const [outlet, setOutlet] = useState("OUT-01"), [err, setErr] = useState("");
  const go = (role: Role) => signIn(role, role === "customer" ? outlet : undefined).catch((e) => setErr(e.message));
  return (
    <main className="login">
      <div className="stack tight">
        <span className="brand"><Icon name="bolt" className="save" />SmartFlux</span>
        <p className="h3">Know what to save, and prove it worked.</p>
      </div>
      <section className="card">
        <h2>Customer</h2>
        <p className="sm muted">Scan the QR at the outlet to see which machines are free. Demo: pick the outlet.</p>
        <label className="stack tight"><span className="label muted">OUTLET</span>
          <select className="select" value={outlet} onChange={(e) => setOutlet(e.target.value)}>
            {outlets.data?.map((o) => <option key={o.outlet_id} value={o.outlet_id}>{o.outlet_id} {o.name}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={() => go("customer")}><Icon name="qr_code_scanner" />Continue as Customer</button>
      </section>
      <button className="btn cta" onClick={() => go("owner")}><Icon name="storefront" />Continue as Owner</button>
      <button className="btn secondary" onClick={() => go("admin")}><Icon name="monitoring" />Continue as Admin</button>
      {err && <Failed error={err} />}
      <p className="sm muted">Demo mode: no password, sample data unless the server runs live.</p>
    </main>
  );
}

function App() {
  const path = usePath(), { session, lang } = usePrefs();
  const qr = new URLSearchParams(location.search).get("outlet");
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    // QR code at the outlet: /customer?outlet=OUT-01 signs a customer in for that outlet.
    if (qr && path.startsWith("/customer") && (session?.role !== "customer" || session.outlets[0] !== qr)) { signIn("customer", qr); return; }
    if (!session && !path.startsWith("/login")) navigate("/login", true);
    else if (session && !allowed(session.role, path)) navigate(HOME[session.role], true);
  }, [path, session, qr]);
  if (!session || path.startsWith("/login")) return <Login />;
  if (!allowed(session.role, path)) return null;
  return session.role === "customer" ? <CustomerApp /> : session.role === "admin" ? <AdminApp /> : <OwnerApp />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
