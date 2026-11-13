"use client";

import { useEffect, useId, useRef, useState } from "react";

export type AccountTheme = "light" | "dark";

type Props = {
  fullName: string;
  email: string;
  role: "Teacher" | "Student";
  profileImagePath?: string | null;
  theme: AccountTheme;
  onThemeChange: (next: AccountTheme) => void;
  onEditProfile: () => void;
  onLogout: () => Promise<void> | void;
  onHelp?: () => void;
  onTenantDashboard?: () => void;
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "U";

/**
 * Shared account dropdown for SAGA's student, teacher, and tenant-manager pages.
 * Click-outside, Escape, semantic buttons, and native Tab order work on mobile
 * and with keyboards without relying on Bootstrap's JS dropdown runtime.
 */
export default function AccountMenu({
  fullName, email, role, profileImagePath, theme, onThemeChange,
  onEditProfile, onLogout, onHelp, onTenantDashboard
}: Props) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const focusOutside = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keys);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [open]);

  function select(action: () => void) {
    setOpen(false);
    action();
  }

  async function signOut() {
    if (signingOut) return;
    setLogoutError("");
    setSigningOut(true);
    try {
      await onLogout();
    } catch {
      setLogoutError("Couldn't sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return <div className="account-menu-shell" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className={`account-menu-trigger${open ? " is-open" : ""}`}
      aria-label={`Account menu for ${fullName}`}
      aria-controls={menuId}
      aria-expanded={open}
      aria-haspopup="true"
      onClick={() => { setOpen(current => !current); setLogoutError(""); }}
    >
      <span className="account-menu-avatar" aria-hidden="true">
        {profileImagePath
          ? <img src={`/api/media?pathname=${encodeURIComponent(profileImagePath)}`} alt=""/>
          : initials(fullName)}
      </span>
      <span className="account-menu-trigger-copy"><b>{fullName}</b><small>{role}</small></span>
      <span className="account-menu-caret" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
    </button>
    {open && <div id={menuId} className="account-menu-panel" aria-label="My account settings">
      <div className="account-menu-identity"><b>{fullName}</b><small>{email}</small><span>{role} account</span></div>
      <div className="account-menu-actions">
        <button type="button" className="account-menu-item" onClick={() => select(onEditProfile)}>
          <span className="account-menu-item-icon" aria-hidden="true">◉</span><span><b>Edit profile</b><small>Name, photo, email &amp; password</small></span>
        </button>
        {onTenantDashboard && <button type="button" className="account-menu-item" onClick={() => select(onTenantDashboard)}>
          <span className="account-menu-item-icon" aria-hidden="true">⚙</span><span><b>Tenant operations</b><small>Manage school workspaces</small></span>
        </button>}
        {onHelp && <button type="button" className="account-menu-item" onClick={() => select(onHelp)}>
          <span className="account-menu-item-icon" aria-hidden="true">?</span><span><b>Help &amp; guides</b><small>FAQ, onboarding &amp; manuals</small></span>
        </button>}
      </div>
      <div className="account-menu-theme">
        <span className="account-menu-section-label">Appearance</span>
        <div role="group" aria-label="Choose appearance" className="account-menu-theme-options">
          <button type="button" aria-pressed={theme === "light"} className={theme === "light" ? "selected" : ""} onClick={() => onThemeChange("light")}>☼ Light</button>
          <button type="button" aria-pressed={theme === "dark"} className={theme === "dark" ? "selected" : ""} onClick={() => onThemeChange("dark")}>◐ Dark</button>
        </div>
      </div>
      <div className="account-menu-footer">
        {logoutError && <p className="account-menu-error" role="alert">{logoutError}</p>}
        <button type="button" className="account-menu-item account-menu-logout" onClick={() => void signOut()} disabled={signingOut}>
          <span className="account-menu-item-icon" aria-hidden="true">↪</span><span>{signingOut ? "Signing out…" : "Log out"}</span>
        </button>
      </div>
    </div>}
  </div>;
}
