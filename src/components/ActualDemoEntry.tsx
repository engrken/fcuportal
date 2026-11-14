"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./DemoWorkspace.module.css";

type Role = "TEACHER" | "STUDENT";
const roles = [
  {
    key: "TEACHER" as Role, icon: "▤", title: "Teacher",
    subtitle: "Open the real faculty portal",
    description: "Explore the actual teaching dashboard, My Classes, electronic workbook, attendance records, grade summaries, and report layouts using sample students."
  },
  {
    key: "STUDENT" as Role, icon: "✦", title: "Student",
    subtitle: "Open the real student portal",
    description: "View the actual student overview, class list, assessment breakdown, published grades, and built-in grade simulator with fictional records."
  }
];

export default function ActualDemoEntry() {
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState("");
  async function enter(role: Role) {
    if (pending) return;
    setPending(role);
    setError("");
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = await response.json();
      if (!response.ok || !data.ok || typeof data.redirect !== "string") {
        throw new Error(data.error || "Unable to open the demonstration portal.");
      }
      window.location.assign(data.redirect);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the demonstration portal.");
      setPending(null);
    }
  }
  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <Link className={styles.logo} href="/" aria-label="Return to SAGA Portal">
        <span className={styles.logoMark}>S</span><span><strong>SAGA</strong><small>ACTUAL PORTAL DEMO</small></span>
      </Link>
      <div className={styles.topActions}>
        <Link className={styles.primaryLink} href="/register">Create your account</Link>
        <Link className={styles.exitLink} href="/">Back to home</Link>
      </div>
    </header>
    <div className={styles.entry}>
      <div className={styles.entryHeader}>
        <span className={styles.kicker}>REAL APPLICATION · FICTIONAL RECORDS</span>
        <h1>Explore the actual SAGA Portal</h1>
        <p>These options open the same Teacher and Student pages used by registered users—not a recreated dashboard. Choose a role and look around the real system.</p>
      </div>
      {error && <div className={styles.notice} role="alert">{error}</div>}
      <div className={styles.roleGrid} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 820, margin: "auto" }}>
        {roles.map(item => <article className={styles.roleCard} key={item.key}>
          <span className={styles.roleIcon} aria-hidden="true">{item.icon}</span>
          <h2>{item.title}</h2>
          <span className={styles.roleSubtitle}>{item.subtitle}</span>
          <p>{item.description}</p>
          <button type="button" className={styles.roleButton}
            onClick={() => void enter(item.key)} disabled={pending !== null}>
            {pending === item.key ? "Opening real portal…" : "Explore actual " + item.title + " portal"} <span aria-hidden="true">→</span>
          </button>
        </article>)}
      </div>
      <p className={styles.disclaimer}>
        <strong>Read-only public access.</strong> The real dashboard, navigation, calculations, and sample academic records are visible, but saving, uploads, profile edits, account actions, and subscription management are disabled. Guest sessions expire after 45 minutes. This protects the live system and other visitors.
      </p>
      <p className={styles.disclaimer}>
        Want to experiment with changing scores or attendance? <Link href="/demo/practice">Open the separate practice simulator</Link> (not the actual portal interface).
        Platform administration is excluded from the public guest login because it has cross-school privileges.
      </p>
    </div>
  </main>;
}
