import Link from "next/link";
import type { Metadata } from "next";
import packageJson from "../../../package.json";
import releases from "@/data/releases.json";

export const metadata: Metadata = {
  title: "What's New | SAGA Portal",
  description: "SAGA Portal feature updates, fixes, and release version history."
};

const labelFor = (kind: string) => kind === "fix" ? "Fixes & maintenance" : kind === "major" ? "Major update" : "Features & improvements";

export default function UpdatesPage() {
  const build = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
  return <main className="saga-updates-page">
    <div className="saga-updates-content">
      <nav className="saga-updates-back"><Link href="/">← SAGA Portal</Link></nav>
      <header className="saga-updates-header">
        <span className="eyebrow">SAGA PORTAL RELEASES</span>
        <h1>What&apos;s new</h1>
        <p>Product updates, improvements, and fixes for the school grading portal.</p>
        <div className="saga-updates-current">
          <strong>Current version: v{packageJson.version}</strong>
          {build && <span>Deployment build {build}</span>}
        </div>
      </header>
      <section aria-label="Release history" className="saga-updates-history">
        {releases.map(entry => <article className="saga-updates-release" key={entry.version}>
          <div className="saga-updates-release-header">
            <div><span className="saga-updates-release-kind">{labelFor(entry.kind)}</span><h2>v{entry.version}</h2></div>
            <time dateTime={entry.date}>{new Date(entry.date + "T12:00:00Z").toLocaleDateString("en-PH", {
              timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric"
            })}</time>
          </div>
          <ul>{entry.changes.map((change, i) => <li key={i}>{change}</li>)}</ul>
        </article>)}
      </section>
      <p className="saga-updates-tip">Each production deployment also has a unique build identifier. Fixes advance the beta revision, while larger feature updates advance the minor version.</p>
    </div>
  </main>;
}
