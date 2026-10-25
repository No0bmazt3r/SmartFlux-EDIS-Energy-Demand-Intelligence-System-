// One app, three roles. The role from sign-in decides which screens exist; the server enforces the same rules.
//   super admin (the business owner): franchise dashboard, people, and the outlet app for every outlet
//   admin (a franchise manager): the outlet app for the outlets it was given
//   customer: outlets and machines (a QR scan works as a guest, without an account)
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, navigate, setPref, usePath, usePrefs, useApi, type Role, type Session } from "./api.ts";
import { AdminApp } from "./admin.tsx";
import { CustomerApp } from "./customer.tsx";
import { KitchenSink } from "./kitchen.tsx";
import { Landing } from "./landing.tsx";
import { OwnerApp } from "./owner.tsx";
import { PeopleApp } from "./people.tsx";
import { Dropdown, Failed, Icon } from "./ui.tsx";
import "./styles.css";

const HOME: Record<Role, string> = { customer: "/customer", admin: "/outlet", superadmin: "/franchise" };
const STAFF_ONLY = ["/franchise", "/people"];
const allowed = (role: Role, path: string) =>
  role === "customer" ? path.startsWith("/customer")
  : role === "admin" ? !path.startsWith("/customer") && !path.startsWith("/login") && !STAFF_ONLY.some((p) => path.startsWith(p))
  : !path.startsWith("/customer") && !path.startsWith("/login");

function start(s: Session) {
  setPref("session", s);
  setPref("outlet", s.outlets[0]);
  navigate(HOME[s.role], true);
}
const guest = (outlet_id: string) => api<Session>("/login/guest", { outlet_id }).then(start);

type AuthConfig = { google: boolean; demo: { password: string | null; accounts: { email: string; role: Role; name: string }[] } | null };
const ROLE_LABEL: Record<Role, string> = { superadmin: "Super admin", admin: "Admin", customer: "Customer" };
const ORDER: Role[] = ["superadmin", "admin", "customer"];
const ROLE_HINT: Record<Role, string> = {
  superadmin: "The business owner: franchise dashboard, every outlet, People",
  admin: "Ipoh franchise manager: briefing, ask the agent, approvals",
  customer: "Free machines and happy hours, made for phones",
};
// With demo roles on top, the email form folds away under a disclosure.
const Wrap = ({ demo, children }: { demo: boolean; children: React.ReactNode }) =>
  demo ? <details className="stack"><summary className="center muted">Sign in with an account instead</summary>{children}</details> : <>{children}</>;

function Login() {
  const outlets = useApi<{ outlet_id: string; name: string }[]>("/outlets");
  const config = useApi<AuthConfig>("/auth/config");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [show, setShow] = useState(false);
  const [outlet, setOutlet] = useState("OUT-01"), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  // Back from Google: /login#token=… (or #error=…). The token never reaches the server's logs in a fragment.
  useEffect(() => {
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", "/login");
    if (h.get("error")) setErr(h.get("error")!);
    const token = h.get("token");
    if (token) fetch("/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Google sign-in expired. Try again."))))
      .then((me: Omit<Session, "token">) => start({ ...me, token }), (e) => setErr(e.message));
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { start(await api<Session>(mode === "in" ? "/login" : "/signup", mode === "in" ? { email, password } : { name, email, password })); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  const demo = config.data?.demo;
  const asDemo = (email: string) => api<Session>("/login/demo", { email }).then(start, (e) => setErr(e.message));
  return (
    <main className="login">
      <div className="login-head">
        <span className="app-tile lg"><Icon name="local_laundry_service" /></span>
        <h1>{demo ? "Try SmartFlux" : mode === "in" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">{demo ? "Pick a role. No password needed in the demo." : mode === "in" ? "Sign in to SmartFlux" : "Find a free machine and see happy-hour times"}</p>
      </div>
      {demo && <section className="card glow stack tight" aria-label="Pick a role">
        <div className="list flush">{[...demo.accounts].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role)).map((a) => (
          <button key={a.email} className="mrow" onClick={() => asDemo(a.email)}>
            <span className="avatar sm">{a.name[0]}</span><span className="grow left"><b>{ROLE_LABEL[a.role]}</b><br /><span className="sm muted">{ROLE_HINT[a.role]}</span></span><Icon name="arrow_forward" className="sm muted" /></button>
        ))}</div>
        {err && <p className="bad sm" role="alert"><Icon name="error" className="sm" /> {err}</p>}
      </section>}
      <Wrap demo={!!demo}>
      <form className="card glow stack" onSubmit={submit}>
        {mode === "up" && <div className="field"><label className="label" htmlFor="su-name">Name</label>
          <span className="input-icon"><Icon name="person" className="sm muted" /><input id="su-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></span></div>}
        <div className="field"><label className="label" htmlFor="si-email">Email address</label>
          <span className="input-icon"><Icon name="mail" className="sm muted" /><input id="si-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></span></div>
        <div className="field"><label className="label" htmlFor="si-pw">Password</label>
          <span className="input-icon"><Icon name="lock" className="sm muted" />
            <input id="si-pw" className="input" type={show ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={mode === "up" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="icon-btn eye" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}><Icon name={show ? "visibility_off" : "visibility"} className="sm" /></button>
          </span>
          {mode === "up" && <span className="sm muted">At least 8 characters.</span>}</div>
        {err && <p className="bad sm" role="alert"><Icon name="error" className="sm" /> {err}</p>}
        <button className="btn cta" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}<Icon name="arrow_forward" className="sm" /></button>
        {config.data?.google && <>
          <div className="or"><span>or continue with</span></div>
          <a className="btn secondary" href="/auth/google"><GoogleMark />Google</a>
        </>}
      </form>
      <p className="center muted">{mode === "in" ? "Don't have an account? " : "Already have an account? "}
        <button className="textlink accent" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }}>{mode === "in" ? "Sign up" : "Sign in"}</button></p>
      </Wrap>

      <section className="card stack tight">
        <h2 className="h3 row"><Icon name="qr_code_scanner" className="accent" />At the outlet?</h2>
        <p className="sm muted">Scanning the QR code on a machine shows that outlet's free machines, no account needed.</p>
        <div className="row"><Dropdown label="Outlet" value={outlet} onChange={setOutlet} options={outlets.data?.map((o) => ({ value: o.outlet_id, label: `${o.outlet_id} ${o.name}` })) ?? []} />
          <button className="btn secondary" onClick={() => guest(outlet).catch((e) => setErr(e.message))}>See machines</button></div>
      </section>

      {(outlets.error || config.error) && <Failed error={outlets.error ?? config.error!} />}
    </main>
  );
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

// The customer app is phone-only: a narrow screen or a touch screen (browser devtools' device mode counts).
const PHONE = "(max-width: 768px), (pointer: coarse)";
function usePhone() {
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  useEffect(() => {
    const m = matchMedia(PHONE), f = () => setPhone(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return phone;
}

function PhoneOnly({ outlet, onPreview }: { outlet: string; onPreview: () => void }) {
  const [copied, setCopied] = useState(false), link = `${location.origin}/customer?outlet=${outlet}`;
  return (
    <main className="login">
      <div className="login-head">
        <span className="app-tile lg"><Icon name="smartphone" /></span>
        <h1>Open SmartFlux on your phone</h1>
        <p className="muted">The customer app is made for phones. Open this link on your phone, or scan the QR code on any machine at the outlet.</p>
      </div>
      <section className="card glow stack tight">
        <code className="mono">{link}</code>
        <div className="row">
          <button className="btn secondary" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}><Icon name={copied ? "check" : "content_copy"} className="sm" />{copied ? "Copied" : "Copy link"}</button>
          <button className="btn outlined" onClick={() => { setPref("session", null); navigate("/login", true); }}>Sign out</button>
        </div>
        <button className="textlink accent sm" onClick={onPreview}>Judging on a laptop? Preview it here</button>
      </section>
    </main>
  );
}

function App() {
  const path = usePath(), { session, lang, outlet } = usePrefs(), phone = usePhone(), [preview, setPreview] = useState(false);
  const qr = new URLSearchParams(location.search).get("outlet");
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    if (path.startsWith("/kitchen-sink") || path === "/") return; // the landing page is for everyone
    if (session && !HOME[session.role]) { setPref("session", null); return; } // a session from an older build
    // QR code at the outlet: /customer?outlet=OUT-01 opens that outlet as a guest unless a customer is already signed in.
    if (qr && path.startsWith("/customer") && (session?.role !== "customer" || !session.outlets.includes(qr))) { guest(qr); return; }
    if (!session && !path.startsWith("/login")) navigate("/login", true);
    else if (session && !allowed(session.role, path)) navigate(HOME[session.role], true);
  }, [path, session, qr]);
  if (path.startsWith("/kitchen-sink")) return <KitchenSink />; // public: components only, no data
  if (path === "/") return <Landing />; // always first; Get started → /login (signed in: straight on to your home)
  if (!session || !HOME[session.role] || path.startsWith("/login")) return <Login />;
  if (!allowed(session.role, path)) return null;
  if (session.role === "customer") return phone || preview ? <CustomerApp /> : <PhoneOnly outlet={outlet ?? session.outlets[0]} onPreview={() => setPreview(true)} />;
  if (path.startsWith("/franchise")) return <AdminApp />;
  if (path.startsWith("/people")) return <PeopleApp />;
  return <OwnerApp />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
