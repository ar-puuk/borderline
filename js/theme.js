const STORAGE_KEY = "borderline:theme";

function getStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStored(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function apply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

/** Wires the theme toggle button. The initial theme is already applied by
 * a blocking inline script in <head> (avoids a flash of the wrong theme);
 * this just handles the toggle and live system-preference changes for
 * anyone who hasn't made an explicit choice yet. */
export function initTheme(toggleBtn) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", (e) => {
    if (!getStored()) apply(e.matches ? "light" : "dark");
  });

  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    apply(next);
    setStored(next);
  });
}
