export const DEFAULT_ACCENT = "#f59e0b";

export const ACCENT_PRESETS = [
  { name: "Amber", hex: "#f59e0b" },
  { name: "Forest", hex: "#16794c" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Rose", hex: "#be123c" },
  { name: "Slate", hex: "#334155" },
] as const;

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix a color toward another by t (0..1). */
function mix(hex: string, toward: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (toward[0] - r) * t, g + (toward[1] - g) * t, b + (toward[2] - b) * t);
}

/** Relative luminance (sRGB, simplified) — used to pick readable text on the accent color. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function accentShades(accent: string) {
  const hex = isHexColor(accent) ? accent : DEFAULT_ACCENT;
  return {
    accent: hex,
    accentDark: mix(hex, [0, 0, 0], 0.22),
    accentSoft: mix(hex, [255, 255, 255], 0.9),
    // Light accents (amber, gold) read best with dark text; darker/saturated accents
    // (blue, indigo, violet, rose, slate) read best with white text.
    accentInk: luminance(hex) > 0.55 ? "#0f172a" : "#ffffff",
    accentDarkMode: mix(hex, [255, 255, 255], 0.2),
  };
}

/** CSS overriding the theme tokens; rendered in the app layout when a custom accent is set. */
export function themeCss(accent: string): string {
  const s = accentShades(accent);
  return (
    `:root{--color-accent:${s.accent};--color-accent-dark:${s.accentDark};` +
    `--color-accent-soft:${s.accentSoft};--color-accent-ink:${s.accentInk};}` +
    `.dark{--color-accent:${s.accentDarkMode};--color-accent-dark:${s.accent};` +
    `--color-accent-ink:${s.accentInk};}`
  );
}
