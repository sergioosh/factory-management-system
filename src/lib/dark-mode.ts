"use client";

import { useEffect, useState } from "react";

type ThemePref = "light" | "dark" | "system";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/** Mirrors the inline script in app/layout.tsx so client and pre-hydration state agree. */
export function useDarkMode() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("fmis.theme") as ThemePref | null) ?? "system";
    setPref(stored);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function set(next: ThemePref) {
    setPref(next);
    localStorage.setItem("fmis.theme", next);
    apply(next);
    setIsDark(document.documentElement.classList.contains("dark"));
  }

  function toggle() {
    set(isDark ? "light" : "dark");
  }

  return { pref, isDark, setPref: set, toggle };
}
