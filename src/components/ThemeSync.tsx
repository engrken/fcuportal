"use client";

import { useEffect } from "react";

export type SagaAppearance = "light" | "dark";
const storageKey = "saga-portal-theme";
const changeEvent = "saga-theme-change";

export function readSagaTheme(): SagaAppearance {
  return window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
}

/** Apply the account appearance to the *entire* app, including the shared footer. */
export function saveSagaTheme(theme: SagaAppearance): void {
  window.localStorage.setItem(storageKey, theme);
  document.body.dataset.sagaTheme = theme;
  window.dispatchEvent(new CustomEvent<SagaAppearance>(changeEvent, { detail: theme }));
}

export default function ThemeSync() {
  useEffect(() => {
    const sync = () => { document.body.dataset.sagaTheme = readSagaTheme(); };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener(changeEvent, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener(changeEvent, sync);
    };
  }, []);
  return null;
}
