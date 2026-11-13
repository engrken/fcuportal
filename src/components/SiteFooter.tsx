import Link from "next/link";
import packageJson from "../../package.json";

/** Globally consistent footer; version is a committed release and build is the exact deployment. */
export default function SiteFooter() {
  const version = packageJson.version;
  const build = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "")
    .trim().slice(0, 7);

  return <footer className="saga-site-footer" aria-label="SAGA Portal copyright and release information">
    <div className="saga-site-footer-inner">
      <p className="saga-site-footer-title">
        <span>© {new Date().getFullYear()} <strong>SAGA Portal</strong></span>
        <span className="saga-site-footer-divider" aria-hidden="true">|</span>
        <Link href="/updates" title={build ? `Release notes · Deployment ${build}` : "Release notes"}>
          v{version}{build && <span className="saga-site-footer-build"> · build {build}</span>}
        </Link>
      </p>
      <p className="saga-site-footer-meta">
        <span>All rights reserved</span>
        <span className="saga-site-footer-dot" aria-hidden="true">·</span>
        <span>Designed &amp; Developed by <strong>Engr. Bulquerin</strong></span>
        <span className="saga-site-footer-dot" aria-hidden="true">·</span>
        <Link href="/privacy">Privacy Notice</Link>
      </p>
    </div>
  </footer>;
}
