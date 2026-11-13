"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import AccountMenu, { type AccountTheme } from "./AccountMenu";
import { saveSagaTheme } from "./ThemeSync";

const statusLabels = {
  VERIFIED: "Verified",
  UNVERIFIED: "Unverified",
  NO_ACCOUNT: "No portal account",
  CLASS_ONLY: "Class roster only"
};
type RosterStatus = keyof typeof statusLabels;
type School = { id: string; name: string };
type RosterEntry = {
  key: string;
  accountId: string | null;
  studentNumber: string | null;
  fullName: string;
  email: string | null;
  status: RosterStatus;
  updatedAt: string | null;
  protected?: boolean;
};

export default function TenantRoster({ school, schools, roster, managerName, managerEmail, managerSchoolSlug, managerProfileImagePath }: {
  school: School; schools: School[]; roster: "students" | "teachers";
  managerName: string; managerEmail: string; managerSchoolSlug: string; managerProfileImagePath: string | null;
}) {
  const router = useRouter();
  const isStudentRoster = roster === "students";
  const heading = isStudentRoster ? "Student roster" : "Teacher roster";
  const endpoint = `/api/tenant-management/schools/${encodeURIComponent(school.id)}/${roster}`;
  const [filters, setFilters] = useState({ query: "", status: "ALL", page: 1 });
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [theme, setTheme] = useState<AccountTheme>("light");
  useEffect(() => {
    const saved = window.localStorage.getItem("saga-portal-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  function setAppearance(next: AccountTheme) {
    saveSagaTheme(next);
    setTheme(next);
  }
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Could not sign out.");
    router.replace("/login");
    router.refresh();
  }

  useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams({ query: filters.query, status: filters.status, page: String(filters.page) });
    setLoading(true);
    setListError("");
    async function load() {
      try {
        const response = await fetch(`${endpoint}?${search}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the roster.");
        setEntries(data[roster]);
        setHasMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "Could not load the roster.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, filters, revision, roster]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setEditing(null);
    setNotice("");
    setFilters({ query: String(data.get("query") ?? "").trim(), status: String(data.get("status") ?? "ALL"), page: 1 });
  }

  function beginEdit(entry: RosterEntry) {
    setEditing(entry);
    setEditEmail(entry.email ?? "");
    setVerified(entry.status === "VERIFIED");
    setSaveError("");
    setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    const fields = new FormData(event.currentTarget);
    const common = { email: editEmail, updatedAt: editing.updatedAt, currentPassword: fields.get("currentPassword") };
    const payload = editing.accountId
      ? { ...common, kind: "ACCOUNT", accountId: editing.accountId, verified }
      : { ...common, kind: "DIRECTORY", studentNumber: editing.studentNumber };
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the record.");
      setNotice(data.changed ? "Account information updated." : "The record already matches these settings.");
      setEditing(null);
      setRevision(value => value + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not update the record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="tenant-roster-page container py-4" data-bs-theme={theme}>
      <header className="tenant-roster-header mb-4">
        <div><Link href="/manage" className="small text-decoration-none">← Tenant management</Link>
          <h1 className="h2 fw-bold mt-3 mb-1">{heading}</h1>
          <p className="text-secondary mb-0">{school.name}</p>
        </div>
        <AccountMenu
          fullName={managerName}
          email={managerEmail}
          role="Teacher"
          profileImagePath={managerProfileImagePath}
          theme={theme}
          onThemeChange={setAppearance}
          onEditProfile={() => router.push(`/${encodeURIComponent(managerSchoolSlug)}/profile`)}
          onLogout={logout}
          onTenantDashboard={() => router.push("/manage")}
        />
      </header>

      <section className="surface p-3 p-lg-4" aria-label={heading}>
        <div className="mb-3">
          <label className="form-label" htmlFor="roster-school">School</label>
          <select id="roster-school" className="form-select" value={school.id} disabled={saving}
            onChange={event => router.push(`/manage/${encodeURIComponent(event.target.value)}/${roster}`)}>
            {schools.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </div>
        <form onSubmit={filter} className="row g-2 align-items-end mb-3">
          <div className="col-12 col-md">
            <label className="form-label" htmlFor="roster-query">{isStudentRoster ? "Name or student ID" : "Name or email"}</label>
            <input id="roster-query" name="query" type="search" className="form-control" maxLength={100} />
          </div>
          <div className="col-8 col-md-3">
            <label className="form-label" htmlFor="roster-status">Verification status</label>
            <select id="roster-status" name="status" className="form-select">
              <option value="ALL">All statuses</option>
              {Object.entries(statusLabels).filter(([value]) => isStudentRoster || value === "VERIFIED" || value === "UNVERIFIED").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="col-4 col-md-auto"><button type="submit" className="btn btn-primary w-100" disabled={saving}>Filter</button></div>
        </form>

        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {loading ? <p className="mb-0 py-3 text-secondary" role="status">Loading {roster}…</p>
          : listError ? <div className="alert alert-danger mb-0" role="alert">{listError} <button type="button" className="btn btn-link p-0" onClick={() => setRevision(value => value + 1)}>Retry</button></div>
          : entries.length === 0 ? <p className="mb-0 py-3 text-secondary">No {roster} match these filters.</p>
          : <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th scope="col">Name</th>{isStudentRoster && <th scope="col">Student ID</th>}<th scope="col">Email</th><th scope="col">Verification</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>{entries.map(entry => (
                <Fragment key={entry.key}>
                  <tr>
                    <th scope="row">{entry.fullName}</th>
                    {isStudentRoster && <td className="text-nowrap">{entry.studentNumber || "—"}</td>}
                    <td className="text-break">{entry.email || "—"}</td>
                    <td><span className={`badge ${entry.status === "VERIFIED" ? "text-bg-success" : entry.status === "UNVERIFIED" ? "text-bg-warning" : "text-bg-secondary"}`}>{statusLabels[entry.status]}</span></td>
                    <td>{entry.protected ? <span className="small text-secondary text-nowrap">Tenant manager</span> : entry.updatedAt && <button type="button" className="btn btn-sm btn-outline-primary"
                      aria-label={`Edit ${entry.fullName}`} aria-expanded={editing?.key === entry.key}
                      disabled={saving} onClick={() => beginEdit(entry)}>Edit</button>}</td>
                  </tr>
                  {editing?.key === entry.key && <tr><td colSpan={isStudentRoster ? 5 : 4}>
                    <form onSubmit={save} className="p-2 p-md-3">
                      <fieldset disabled={saving}>
                        <legend className="h6 fw-bold mb-3">Edit {entry.fullName}</legend>
                        <div className="row g-3">
                          <div className="col-12 col-md">
                            <label className="form-label" htmlFor="roster-edit-email">Email address</label>
                            <input id="roster-edit-email" className="form-control" type="email" value={editEmail} maxLength={200} required onChange={event => {
                              const value = event.target.value;
                              setEditEmail(value);
                              if (value.trim().toLowerCase() !== entry.email?.toLowerCase()) setVerified(false);
                            }} />
                          </div>
                          {entry.accountId && <div className="col-12 col-md-3">
                            <label className="form-label" htmlFor="roster-edit-verification">Verification</label>
                            <select id="roster-edit-verification" className="form-select" value={verified ? "verified" : "unverified"} onChange={event => setVerified(event.target.value === "verified")}>
                              <option value="unverified">Unverified</option>
                              <option value="verified">Verified manually</option>
                            </select>
                          </div>}
                          <div className="col-12 col-md">
                            <label className="form-label" htmlFor="roster-edit-password">Your current password</label>
                            <input id="roster-edit-password" name="currentPassword" className="form-control" type="password" autoComplete="current-password" maxLength={100} required />
                          </div>
                        </div>
                        <p className="form-text">{entry.accountId
                          ? "Account changes sign the user out. Mark an address verified only after confirming it belongs to the account holder."
                          : "This email is used for registration and Quick Check until the student creates a portal account."}</p>
                        {saveError && <div className="alert alert-danger py-2" role="alert">{saveError}</div>}
                        <div className="d-flex flex-wrap gap-2">
                          <button type="submit" className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save changes"}</button>
                          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </fieldset>
                    </form>
                  </td></tr>}
                </Fragment>
              ))}</tbody>
            </table>
          </div>}
        <nav aria-label={`${heading} pages`} className="d-flex justify-content-end align-items-center gap-2 mt-3">
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading || saving || filters.page === 1} onClick={() => {
            setEditing(null);
            setFilters(value => ({ ...value, page: value.page - 1 }));
          }}>Previous</button>
          <span className="small">Page {filters.page}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading || saving || !!listError || !hasMore} onClick={() => {
            setEditing(null);
            setFilters(value => ({ ...value, page: value.page + 1 }));
          }}>Next</button>
        </nav>
      </section>
    </main>
  );
}
