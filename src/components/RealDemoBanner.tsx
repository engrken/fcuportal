"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./RealDemoBanner.module.css";

export default function RealDemoBanner() {
  const [busy, setBusy] = useState(false);
  async function exitDemo() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } finally {
      window.location.assign("/");
    }
  }
  return <div className={styles.notice} role="status">
    <div className={styles.copy}>
      <strong>REAL SAGA PORTAL · READ-ONLY DEMO</strong>
      <span>You are exploring the actual Teacher/Student interface using fictional school records. Navigation, calculations, and reports are real; saving and account changes are disabled.</span>
    </div>
    <div className={styles.actions}>
      <Link href="/demo">Change demo role</Link>
      <button type="button" disabled={busy} onClick={() => void exitDemo()}>{busy ? "Exiting…" : "Exit demo"}</button>
    </div>
  </div>;
}
