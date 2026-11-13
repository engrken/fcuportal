"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Payment = {
  id: string; amount: number; method: string; reference: string | null;
  paidAt: string; coverageFrom: string | null; coverageTo: string | null; note: string | null;
};
type Plan = "FREE" | "PREMIUM" | "ENTERPRISE";
type Subscription = "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
type Tenant = {
  id: string; name: string; shortName: string; slug: string; plan: Plan;
  isActive: boolean; subscriptionStatus: Subscription; subscriptionExpiresAt: string | null;
  createdAt: string; updatedAt: string;
  users: Array<{ id: string; fullName: string; email: string; createdAt: string; emailVerifiedAt: string | null }>;
  teacherCount: number; verifiedTeacherCount: number;
  studentCount: number; verifiedStudentCount: number; directoryCount: number;
  classCount: number; publishedClasses: number; studentSeats: number;
  paymentCount: number; totalPayments: number; tenantPayments: Payment[];
};
type Activity = {
  id: string; entity: string; action: string; createdAt: string;
  actor: { fullName: string; role: string };
};

const planLabel = (plan: Plan) => plan === "FREE" ? "Freemium" : plan === "PREMIUM" ? "Premium" : "Pro / Enterprise";
const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(amount);
const dateLabel = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" }) : "Not set";

function todayManila(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const expiry = Date.parse(date.slice(0, 10) + "T00:00:00Z");
  const today = Date.parse(todayManila() + "T00:00:00Z");
  return Number.isFinite(expiry) ? Math.round((expiry - today) / 86400000) : null;
}
function tenantHealth(tenant: Tenant) {
  if (!tenant.isActive || tenant.subscriptionStatus !== "ACTIVE") {
    return { level: "danger", label: tenant.subscriptionStatus === "PAST_DUE" ? "Past due · Inactive" : tenant.subscriptionStatus === "ACTIVE" ? "Inactive" : tenant.subscriptionStatus === "SUSPENDED" ? "Suspended" : "Cancelled" };
  }
  const remaining = daysUntil(tenant.subscriptionExpiresAt);
  if (remaining !== null && remaining < 0) return { level: "danger", label: "Expiry date passed" };
  if (remaining !== null && remaining <= 30) return { level: "warning", label: remaining === 0 ? "Expires today" : `Expires in ${remaining}d` };
  if (tenant.teacherCount === 0) return { level: "warning", label: "Needs first teacher" };
  if (tenant.verifiedTeacherCount === 0) return { level: "warning", label: "Verify teacher accounts" };
  if (tenant.classCount === 0) return { level: "warning", label: "No classes created" };
  return { level: "good", label: "Operational" };
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function downloadSchoolReport(tenants: Tenant[]) {
  const header = ["School", "Slug", "Plan", "Activation", "Expiry", "Teachers", "Verified teachers", "Student accounts", "Verified students", "Classes", "Visible classes", "Class enrollment seats", "Directory records", "Payments", "Lifetime receipts (PHP)"];
  const rows = tenants.map(t => [
    t.name, t.slug, t.plan, t.subscriptionStatus, t.subscriptionExpiresAt?.slice(0, 10) ?? "",
    t.teacherCount, t.verifiedTeacherCount, t.studentCount, t.verifiedStudentCount,
    t.classCount, t.publishedClasses, t.studentSeats, t.directoryCount, t.paymentCount, t.totalPayments
  ]);
  const csv = "\uFEFF" + [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `saga-school-report-${todayManila()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TenantManagement({ managerName, managerEmail }: { managerName: string; managerEmail: string }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState("");
  const [plan, setPlan] = useState<Plan>("FREE");
  const [status, setStatus] = useState<Subscription>("ACTIVE");
  const [expires, setExpires] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [coverageTo, setCoverageTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState("attention");
  const [page, setPage] = useState(1);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityMore, setActivityMore] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [activityRevision, setActivityRevision] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  async function load(quiet = false) {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tenant-management/schools", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load school workspaces.");
      const schools = (data.schools ?? []) as Tenant[];
      setTenants(schools);
      setSelected(current => schools.some(entry => entry.id === current) ? current : schools[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load school workspaces.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const saved = window.localStorage.getItem("saga-portal-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    window.localStorage.setItem("saga-portal-theme", next);
    setTheme(next);
  }

  const active = tenants.find(tenant => tenant.id === selected) ?? null;
  useEffect(() => {
    if (!active) return;
    setPlan(active.plan);
    setStatus(active.subscriptionStatus);
    setExpires(active.subscriptionExpiresAt?.slice(0, 10) || "");
    setAmount(""); setReference(""); setCoverageTo(""); setNote("");
  }, [active?.id]);

  const unsaved = !!active && (
    plan !== active.plan || status !== active.subscriptionStatus ||
    expires !== (active.subscriptionExpiresAt?.slice(0, 10) || "") || amount.trim() !== ""
  );
  function selectTenant(id: string) {
    if (id === selected) return;
    if (unsaved && !window.confirm("Discard unsaved tenant settings or payment details?")) return;
    setSelected(id);
    setActivityOpen(false); setActivityPage(1); setActivity([]);
    setError(""); setNotice("");
  }
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const rows = tenants.filter(tenant =>
      (!query || `${tenant.name} ${tenant.shortName} ${tenant.slug}`.toLocaleLowerCase().includes(query)) &&
      (planFilter === "ALL" || tenant.plan === planFilter) &&
      (statusFilter === "ALL" || (statusFilter === "ATTENTION" ? tenantHealth(tenant).level !== "good" : tenant.subscriptionStatus === statusFilter))
    );
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "expiring") return (daysUntil(a.subscriptionExpiresAt) ?? Infinity) - (daysUntil(b.subscriptionExpiresAt) ?? Infinity);
      const severity = (tenant: Tenant) => tenantHealth(tenant).level === "danger" ? 0 : tenantHealth(tenant).level === "warning" ? 1 : 2;
      return severity(a) - severity(b) || a.name.localeCompare(b.name);
    });
    return rows;
  }, [tenants, search, planFilter, statusFilter, sort]);
  const perPage = 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const kpis = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter(tenant => tenant.isActive && tenant.subscriptionStatus === "ACTIVE").length,
    attention: tenants.filter(tenant => tenantHealth(tenant).level !== "good").length,
    teachers: tenants.reduce((sum, tenant) => sum + tenant.teacherCount, 0),
    students: tenants.reduce((sum, tenant) => sum + tenant.studentCount, 0),
    receipts: tenants.reduce((sum, tenant) => sum + tenant.totalPayments, 0)
  }), [tenants]);

  useEffect(() => {
    if (!selected || !activityOpen) return;
    const controller = new AbortController();
    setActivityLoading(true);
    setActivityError("");
    async function retrieve() {
      try {
        const response = await fetch(`/api/tenant-management/schools/${encodeURIComponent(selected)}/activity?page=${activityPage}`,
          { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load activity.");
        if (!controller.signal.aborted) {
          setActivity(data.events ?? []);
          setActivityMore(!!data.hasMore);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setActivityError(cause instanceof Error ? cause.message : "Could not load activity.");
      } finally {
        if (!controller.signal.aborted) setActivityLoading(false);
      }
    }
    void retrieve();
    return () => controller.abort();
  }, [selected, activityOpen, activityPage, activityRevision]);

  async function save() {
    if (!active || busy) return;
    if (status !== "ACTIVE" && status !== active.subscriptionStatus &&
      !window.confirm("Changing this school to an inactive subscription status will restrict access. Continue?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payment = amount ? {
        amount: Number(amount), method, reference: reference || undefined,
        coverageTo: coverageTo || undefined, note: note || undefined
      } : undefined;
      const response = await fetch("/api/tenant-management/schools", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: active.id, plan, subscriptionStatus: status,
          subscriptionExpiresAt: expires || null, payment
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save tenant changes.");
      setNotice(payment ? "Tenant settings saved and the payment was recorded." : "Tenant settings saved.");
      setAmount(""); setReference(""); setCoverageTo(""); setNote("");
      setActivityRevision(revision => revision + 1);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save tenant changes.");
    } finally {
      setBusy(false);
    }
  }
  function extendExpiry() {
    const today = todayManila();
    const date = new Date(`${expires && expires > today ? expires : today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 30);
    setExpires(date.toISOString().slice(0, 10));
  }
  async function copyStudentLink() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register?schoolId=${encodeURIComponent(active.id)}`);
      setNotice(`Student registration link copied for ${active.name}.`);
    } catch {
      setError("Clipboard permission is unavailable. Open /register and select the school manually.");
    }
  }
  const activeHealth = active ? tenantHealth(active) : null;
  const expiryDays = active ? daysUntil(active.subscriptionExpiresAt) : null;
  const isPlanUnchanged = !!active && !unsaved;

  return <main className="tenant-operations container-fluid py-4 px-3 px-lg-5" data-bs-theme={theme}>
    <header className="tenant-operations-header">
      <div><Link href="/dashboard" className="small text-decoration-none">← Back to SAGA</Link>
        <p className="text-primary fw-bold small text-uppercase mt-3 mb-1">SAGA PLATFORM ADMINISTRATION</p>
        <h1 className="h2 fw-bold mb-2">Tenant operations</h1>
        <p className="text-secondary mb-0">Schools, access, subscriptions, adoption, and audit-ready records.</p>
      </div>
      <div className="tenant-admin-controls">
        <div><b>{managerName}</b><small>{managerEmail}</small></div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>{theme === "light" ? "◐ Dark" : "☼ Light"}</button>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void load(true)} disabled={refreshing || loading || busy}>
          {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
      </div>
    </header>

    <div className="tenant-operations-note" role="note">
      Freemium is free; Premium is currently listed at <b>₱499 per school/month</b>; Pro / Enterprise pricing is by agreement.
      Subscriptions and payment entries are managed manually. This module does not charge customers or automatically suspend a school when an expiry date passes.
    </div>

    {error && <div className="alert alert-danger" role="alert">{error}<button type="button" className="btn-close float-end" aria-label="Dismiss error" onClick={() => setError("")}/></div>}
    {notice && <div className="alert alert-success" role="status">{notice}<button type="button" className="btn-close float-end" aria-label="Dismiss notice" onClick={() => setNotice("")}/></div>}

    <section className="tenant-kpi-grid" aria-label="Platform summary">
      {[
        { title: "School workspaces", value: String(kpis.total), hint: "Registered organizations" },
        { title: "Active schools", value: String(kpis.active), hint: "Currently enabled" },
        { title: "Needs attention", value: String(kpis.attention), hint: "Expiry, setup, or activation", attention: kpis.attention > 0 },
        { title: "Teacher / student accounts", value: `${kpis.teachers} / ${kpis.students}`, hint: "Portal registrations" },
        { title: "Recorded payments", value: money(kpis.receipts), hint: "All-time manual payment entries" }
      ].map(card => <div className={`surface tenant-kpi${card.attention ? " tenant-kpi-alert" : ""}`} key={card.title}>
        <small>{card.title}</small><strong>{card.value}</strong><span>{card.hint}</span>
      </div>)}
    </section>

    {loading ? <div className="surface p-5 text-center" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"/> Loading school workspaces…</div> :
      <div className="tenant-workspace-grid">
        <section className="surface tenant-school-list" aria-label="School directory">
          <div className="tenant-panel-header">
            <div><h2 className="h5 mb-1">School directory</h2><small className="text-secondary">{filtered.length} of {tenants.length} schools</small></div>
            <div className="tenant-export-actions">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => downloadSchoolReport(tenants)} disabled={!tenants.length}>Export school report</button>
              <a className="btn btn-outline-primary btn-sm" href="/api/tenant-management/payments/export">Export payment ledger</a>
            </div>
          </div>
          <div className="tenant-filter-grid">
            <label><span>Search schools</span><input className="form-control" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="School name or slug"/></label>
            <label><span>Plan</span><select className="form-select" value={planFilter} onChange={event => { setPlanFilter(event.target.value); setPage(1); }}><option value="ALL">All plans</option><option value="FREE">Freemium</option><option value="PREMIUM">Premium</option><option value="ENTERPRISE">Pro / Enterprise</option></select></label>
            <label><span>Activation / follow-up</span><select className="form-select" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="ATTENTION">Needs attention</option><option value="ACTIVE">Active</option><option value="PAST_DUE">Past due</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option></select></label>
            <label><span>Sort</span><select className="form-select" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="attention">Action required first</option><option value="expiring">Expiry date</option><option value="name">School name</option><option value="newest">Newest first</option></select></label>
          </div>

          <div className="tenant-table-wrap">
            <table className="table align-middle tenant-workspace-table">
              <thead><tr><th>School</th><th>Tier</th><th>Teachers</th><th>Students</th><th>Classes / seats</th><th>Health</th><th>Rosters</th></tr></thead>
              <tbody>{visible.map(tenant => {
                const health = tenantHealth(tenant);
                return <tr key={tenant.id} className={selected === tenant.id ? "tenant-row-selected" : ""}>
                  <td data-label="School"><button type="button" className="tenant-school-button" aria-pressed={selected === tenant.id} onClick={() => selectTenant(tenant.id)}>
                    <b>{tenant.name}</b><small>{tenant.slug}</small>
                  </button></td>
                  <td data-label="Tier">{planLabel(tenant.plan)}</td>
                  <td data-label="Teachers">{tenant.verifiedTeacherCount}/{tenant.teacherCount} verified</td>
                  <td data-label="Students">{tenant.verifiedStudentCount}/{tenant.studentCount} verified</td>
                  <td data-label="Classes / seats">{tenant.classCount} / {tenant.studentSeats}</td>
                  <td data-label="Health"><span className={`tenant-health tenant-health-${health.level}`}>{health.label}</span></td>
                  <td data-label="Rosters"><div className="tenant-roster-links">
                    <Link href={`/manage/${encodeURIComponent(tenant.id)}/students`} className="btn btn-outline-primary btn-sm">Students</Link>
                    <Link href={`/manage/${encodeURIComponent(tenant.id)}/teachers`} className="btn btn-outline-primary btn-sm">Teachers</Link>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!filtered.length && <div className="tenant-list-empty">
            <b>No matching schools</b><p>Try a different search or reset the filters.</p>
            <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => { setSearch(""); setPlanFilter("ALL"); setStatusFilter("ALL"); setPage(1); }}>Clear filters</button>
          </div>}
          {totalPages > 1 && <div className="tenant-pagination">
            <span>Page {currentPage} of {totalPages}</span>
            <div><button type="button" className="btn btn-outline-secondary btn-sm" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>
          </div>}
          <p className="tenant-data-hint">Class seats count class-enrollment records; a student appearing in multiple classes counts more than once. Registered student accounts are counted separately.</p>
        </section>

        <section className="tenant-settings-column" aria-label="Selected school operations">
          {active ? <>
            <div className="surface tenant-settings-panel">
              <div className="tenant-panel-header">
                <div><span className="eyebrow">SELECTED SCHOOL</span><h2>{active.name}</h2><small className="text-secondary">{active.slug} · Created {dateLabel(active.createdAt)}</small></div>
                <span className={`tenant-health tenant-health-${activeHealth?.level || "good"}`}>{activeHealth?.label}</span>
              </div>
              <div className="tenant-selected-stats">
                <div><small>Teachers</small><b>{active.teacherCount}</b><span>{active.verifiedTeacherCount} verified</span></div>
                <div><small>Students</small><b>{active.studentCount}</b><span>{active.verifiedStudentCount} verified</span></div>
                <div><small>Classes</small><b>{active.classCount}</b><span>{active.publishedClasses} visible</span></div>
                <div><small>Roster seats</small><b>{active.studentSeats}</b><span>{active.directoryCount} directory entries</span></div>
              </div>
              <div className="tenant-action-row">
                <Link className="btn btn-outline-primary btn-sm" href={`/manage/${encodeURIComponent(active.id)}/students`}>Manage students</Link>
                <Link className="btn btn-outline-primary btn-sm" href={`/manage/${encodeURIComponent(active.id)}/teachers`}>Manage teachers</Link>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void copyStudentLink()} disabled={!active.teacherCount}>Copy student signup link</button>
              </div>
              {!active.teacherCount && <p className="tenant-data-hint">Student signup becomes available after the first teacher registers for this school.</p>}
              {activeHealth?.level !== "good" && <div className="tenant-follow-up" role="note">
                <b>Follow-up recommended:</b> {activeHealth?.label}.
                {expiryDays !== null && expiryDays < 0 && " The expiry date alone does not disable access; review the activation status manually."}
              </div>}
              <div className="tenant-section-header"><h3>Plan and activation</h3><span>Changes are audited</span></div>
              <div className="row g-3">
                <div className="col-12 col-sm-6"><label className="form-label" htmlFor="tenant-plan">Plan</label><select id="tenant-plan" className="form-select" value={plan} disabled={busy} onChange={event => setPlan(event.target.value as Plan)}><option value="FREE">Freemium · ₱0</option><option value="PREMIUM">Premium · ₱499/month</option><option value="ENTERPRISE">Pro / Enterprise · Custom</option></select></div>
                <div className="col-12 col-sm-6"><label className="form-label" htmlFor="tenant-status">Activation</label><select id="tenant-status" className="form-select" value={status} disabled={busy} onChange={event => setStatus(event.target.value as Subscription)}><option value="ACTIVE">Active</option><option value="PAST_DUE">Past due</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option></select></div>
                <div className="col-12"><label className="form-label" htmlFor="tenant-expiry">Paid-through / expiry date</label>
                  <div className="tenant-renewal-row"><input id="tenant-expiry" className="form-control" type="date" value={expires} disabled={busy} onChange={event => setExpires(event.target.value)}/>
                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={extendExpiry} disabled={busy}>Extend 30 days</button></div>
                  <div className="form-text">Leave blank for no expiry. Renewal dates are saved only when you select Save.</div>
                </div>
              </div>
              <div className="tenant-section-header"><h3>Record payment</h3><span>Optional · manual entry</span></div>
              <div className="row g-3">
                <div className="col-12 col-sm-6"><label className="form-label" htmlFor="tenant-amount">Amount (PHP)</label><input id="tenant-amount" className="form-control" type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)}/></div>
                <div className="col-12 col-sm-6"><label className="form-label" htmlFor="tenant-method">Method</label><input id="tenant-method" className="form-control" value={method} maxLength={40} disabled={busy} onChange={event => setMethod(event.target.value)}/></div>
                <div className="col-12"><label className="form-label" htmlFor="tenant-reference">Reference</label><input id="tenant-reference" className="form-control" value={reference} maxLength={120} disabled={busy} onChange={event => setReference(event.target.value)}/></div>
                <div className="col-12"><label className="form-label" htmlFor="tenant-coverage">Coverage through</label><input id="tenant-coverage" className="form-control" type="date" value={coverageTo} disabled={busy} onChange={event => setCoverageTo(event.target.value)}/></div>
                <div className="col-12"><label className="form-label" htmlFor="tenant-note">Internal note</label><textarea id="tenant-note" className="form-control" rows={2} maxLength={500} disabled={busy} value={note} onChange={event => setNote(event.target.value)}/></div>
              </div>
              <div className="tenant-save-actions"><span>{isPlanUnchanged ? "No pending changes" : "Unsaved changes"}</span>
                <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || isPlanUnchanged}>{busy ? "Saving…" : "Save tenant settings"}</button></div>
            </div>
            <div className="surface tenant-operations-detail">
              <div className="tenant-panel-header"><div><h3>Payment history</h3><small>{active.paymentCount} recorded payment{active.paymentCount === 1 ? "" : "s"} · {money(active.totalPayments)} all time</small></div>
                <a className="btn btn-outline-primary btn-sm" href={`/api/tenant-management/payments/export?schoolId=${encodeURIComponent(active.id)}`}>Export CSV</a></div>
              {active.tenantPayments.length ? <div className="tenant-payment-list">{active.tenantPayments.map(payment => <div key={payment.id}>
                <b>{money(payment.amount)}</b><span>{payment.method} · {dateLabel(payment.paidAt)}</span>
                <small>{payment.reference || "No reference"}{payment.coverageTo ? ` · Through ${dateLabel(payment.coverageTo)}` : ""}{payment.note ? ` · ${payment.note}` : ""}</small>
              </div>)}</div> : <p className="small text-secondary mb-0">No payments recorded for this school.</p>}
              {active.paymentCount > active.tenantPayments.length && <p className="tenant-data-hint">Showing 5 recent payments; export CSV for the full ledger.</p>}
            </div>
            <div className="surface tenant-operations-detail">
              <div className="tenant-panel-header"><div><h3>Activity and accountability</h3><small>Audit events from this school and its tenant settings</small></div>
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => { setActivityOpen(open => !open); setActivityPage(1); }}>{activityOpen ? "Hide activity" : "View activity"}</button></div>
              {activityOpen && <>
                {activityLoading ? <p role="status" className="small text-secondary mt-3 mb-0">Loading activity…</p> : activityError ? <div className="alert alert-danger mt-3">{activityError}<button className="btn btn-link btn-sm" onClick={() => setActivityRevision(value => value + 1)}>Retry</button></div> :
                  activity.length ? <div className="tenant-activity-list">{activity.map(event => <article key={event.id}>
                    <b>{event.action}</b><small>{event.actor.fullName} · {event.entity} · {new Date(event.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</small>
                  </article>)}</div> : <p className="small text-secondary mt-3">No activity records available.</p>}
                {(activityPage > 1 || activityMore) && <div className="tenant-pagination mt-3"><span>Page {activityPage}</span><div><button className="btn btn-outline-secondary btn-sm" disabled={activityPage === 1 || activityLoading} onClick={() => setActivityPage(p => p - 1)}>Previous</button><button className="btn btn-outline-secondary btn-sm" disabled={!activityMore || activityLoading} onClick={() => setActivityPage(p => p + 1)}>Next</button></div></div>}
              </>}
            </div>
            <div className="surface tenant-operations-detail">
              <div className="tenant-panel-header"><div><h3>Teachers in this school</h3><small>Recent accounts · {active.teacherCount} total</small></div>
                <Link className="btn btn-outline-primary btn-sm" href={`/manage/${encodeURIComponent(active.id)}/teachers`}>View all</Link></div>
              {active.users.length ? <div className="tenant-teacher-list">{active.users.map(teacher => <div key={teacher.id}>
                <b>{teacher.fullName}</b><small>{teacher.email}</small><span className={`tenant-health tenant-health-${teacher.emailVerifiedAt ? "good" : "warning"}`}>{teacher.emailVerifiedAt ? "Verified" : "Unverified"}</span>
              </div>)}</div> : <p className="small text-secondary mb-0">No teachers have registered for this school yet.</p>}
              {active.teacherCount > active.users.length && <p className="tenant-data-hint">Showing the eight newest teachers. Use View all for the full account roster.</p>}
            </div>
          </> : <div className="surface tenant-settings-panel tenant-select-empty">Select a school to manage its plan, rosters, payments, and audit history.</div>}
        </section>
      </div>}
  </main>;
}
