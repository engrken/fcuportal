"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Payment = { id: string; amount: number; method: string; reference: string | null; paidAt: string; coverageFrom: string | null; coverageTo: string | null; note: string | null };
type Tenant = { id: string; name: string; shortName: string; slug: string; plan: "FREE" | "PREMIUM" | "ENTERPRISE"; isActive: boolean; subscriptionStatus: "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED"; subscriptionExpiresAt: string | null; createdAt: string; users: Array<{ id: string; fullName: string; email: string; createdAt: string }>; studentSeats: number; tenantPayments: Payment[] };

export default function TenantManagement({ managerName, managerEmail }: { managerName: string; managerEmail: string }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState("");
  const [plan, setPlan] = useState<Tenant["plan"]>("FREE");
  const [status, setStatus] = useState<Tenant["subscriptionStatus"]>("ACTIVE");
  const [expires, setExpires] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [coverageTo, setCoverageTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/tenant-management/schools", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load school workspaces.");
      setTenants(data.schools);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load tenants."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const active = tenants.find(tenant => tenant.id === selected) || null;
  useEffect(() => {
    if (!active) return;
    setPlan(active.plan); setStatus(active.subscriptionStatus); setExpires(active.subscriptionExpiresAt?.slice(0, 10) || "");
    setAmount(""); setReference(""); setCoverageTo(""); setNote("");
  }, [active?.id]);

  async function save() {
    if (!active) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payment = amount ? { amount: Number(amount), method, reference: reference || undefined, coverageTo: coverageTo || undefined, note: note || undefined } : undefined;
      const response = await fetch("/api/tenant-management/schools", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: active.id, plan, subscriptionStatus: status, subscriptionExpiresAt: expires || null, payment }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save tenant changes.");
      setNotice("Tenant plan and activation were updated."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save tenant changes."); }
    finally { setBusy(false); }
  }

  return <main className="container-fluid py-4 px-3 px-lg-5" style={{ maxWidth: 1500 }}>
    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4"><div><Link href="/dashboard" className="small text-decoration-none">← Back to SAGA</Link><p className="text-primary fw-bold small text-uppercase mt-3 mb-1">SAGA PLATFORM ADMINISTRATION</p><h1 className="h2 fw-bold mb-2">Tenant management</h1><p className="text-secondary mb-0">Manage school workspaces, student and teacher rosters, plans, and payments.</p></div><div className="text-end"><span className="badge text-bg-light">Signed in as {managerName}</span><div className="small text-secondary mt-1">{managerEmail}</div></div></div>
    <div className="alert alert-info">Premium is <b>₱499 per school per month</b>. Freemium is free. Pro / Enterprise pricing is set by agreement. Payment records here document payments received; they do not charge a card or initiate a bank transfer.</div>
    {error && <div className="alert alert-danger">{error}</div>}{notice && <div className="alert alert-success">{notice}</div>}
    {loading ? <div className="surface p-5 text-center" role="status">Loading school workspaces…</div> : <div className="row g-4"><section className="col-12 col-xl-7"><div className="surface p-3 p-lg-4"><div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 mb-0">School workspaces <span className="badge text-bg-light ms-1">{tenants.length}</span></h2><button className="btn btn-outline-primary btn-sm" onClick={()=>void load()}>Refresh</button></div><div className="table-responsive"><table className="table align-middle"><thead><tr><th>School</th><th>Tier</th><th>Teachers</th><th>Seats</th><th>Status</th><th scope="col">Rosters</th></tr></thead><tbody>{tenants.map(tenant=><tr key={tenant.id} className={selected===tenant.id?"table-primary":""} role="button" onClick={()=>setSelected(tenant.id)}><td><b>{tenant.name}</b><small className="d-block text-secondary">{tenant.slug}</small></td><td>{tenant.plan === "FREE" ? "Freemium" : tenant.plan === "PREMIUM" ? "Premium" : "Pro / Enterprise"}</td><td>{tenant.users.length}</td><td>{tenant.studentSeats}</td><td><span className={`badge ${tenant.isActive?"text-bg-success":"text-bg-secondary"}`}>{tenant.isActive?"Active":tenant.subscriptionStatus}</span></td><td><div className="d-flex flex-wrap gap-2">{(["students", "teachers"] as const).map(roster => <Link key={roster} className="btn btn-outline-primary btn-sm text-nowrap" href={`/manage/${encodeURIComponent(tenant.id)}/${roster}`} aria-label={`View ${tenant.name} ${roster === "students" ? "student" : "teacher"} roster`} onClick={event => event.stopPropagation()}>{roster === "students" ? "Students" : "Teachers"}</Link>)}</div></td></tr>)}</tbody></table></div>{tenants.length===0&&<p className="text-secondary mb-0">No school workspaces yet.</p>}</div></section>
    <section className="col-12 col-xl-5">{active ? <div className="surface p-3 p-lg-4"><p className="text-primary fw-bold small text-uppercase mb-1">TENANT SETTINGS</p><h2 className="h4 fw-bold">{active.name}</h2><p className="text-secondary">Created {new Date(active.createdAt).toLocaleDateString()}</p><div className="row g-3"><div className="col-6"><label className="form-label" htmlFor="tenant-plan">Plan</label><select id="tenant-plan" className="form-select" value={plan} onChange={e=>setPlan(e.target.value as Tenant["plan"])}><option value="FREE">Freemium · ₱0</option><option value="PREMIUM">Premium · ₱499/month</option><option value="ENTERPRISE">Pro / Enterprise · Custom</option></select></div><div className="col-6"><label className="form-label" htmlFor="tenant-status">Activation</label><select id="tenant-status" className="form-select" value={status} onChange={e=>setStatus(e.target.value as Tenant["subscriptionStatus"])}><option value="ACTIVE">Active</option><option value="PAST_DUE">Past due</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option></select></div><div className="col-12"><label className="form-label" htmlFor="tenant-expiry">Paid-through / expiry date</label><input id="tenant-expiry" className="form-control" type="date" value={expires} onChange={e=>setExpires(e.target.value)}/><div className="form-text">Leave blank for no expiry, including Freemium workspaces.</div></div><hr className="my-2"/><div className="col-12"><h3 className="h6 fw-bold mb-0">Record a payment (optional)</h3><small className="text-secondary">A payment record is added only when an amount is entered.</small></div><div className="col-6"><label className="form-label" htmlFor="tenant-amount">Amount (PHP)</label><input id="tenant-amount" className="form-control" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div><div className="col-6"><label className="form-label" htmlFor="tenant-method">Method</label><input id="tenant-method" className="form-control" value={method} onChange={e=>setMethod(e.target.value)} maxLength={40}/></div><div className="col-12"><label className="form-label" htmlFor="tenant-reference">Reference</label><input id="tenant-reference" className="form-control" value={reference} onChange={e=>setReference(e.target.value)} maxLength={120}/></div><div className="col-12"><label className="form-label" htmlFor="tenant-coverage">Coverage through</label><input id="tenant-coverage" className="form-control" type="date" value={coverageTo} onChange={e=>setCoverageTo(e.target.value)}/></div><div className="col-12"><label className="form-label" htmlFor="tenant-note">Internal note</label><textarea id="tenant-note" className="form-control" rows={2} value={note} onChange={e=>setNote(e.target.value)} maxLength={500}/></div></div><button className="btn btn-primary w-100 mt-4" onClick={()=>void save()} disabled={busy}>{busy?"Saving…":"Save tenant settings"}</button>
      <hr/><h3 className="h6 fw-bold">Teachers</h3>{active.users.length ? active.users.map(teacher=><div className="small py-1" key={teacher.id}>{teacher.fullName}<span className="text-secondary"> · {teacher.email}</span></div>) : <p className="small text-secondary">No teacher accounts.</p>}
      <hr/><h3 className="h6 fw-bold">Recent payments</h3>{active.tenantPayments.length ? active.tenantPayments.map(payment=><div className="small border-top py-2" key={payment.id}><b>₱{payment.amount.toLocaleString()}</b> · {payment.method} · {new Date(payment.paidAt).toLocaleDateString()}<div className="text-secondary">{payment.reference || "No reference"}{payment.coverageTo?` · through ${new Date(payment.coverageTo).toLocaleDateString()}`:""}{payment.note?` · ${payment.note}`:""}</div></div>) : <p className="small text-secondary">No payment history recorded.</p>}</div> : <div className="surface p-5 text-center text-secondary">Select a school workspace to manage its plan, activation, and payment history.</div>}</section></div>}
  </main>;
}
