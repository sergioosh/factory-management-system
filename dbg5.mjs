import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3000/login");
await p.getByLabel(/Email/).fill("admin@factory.local");
await p.getByLabel(/Password/).fill("admin1234");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForURL("http://localhost:3000/");
await p.goto("http://localhost:3000/adjustments");
await p.waitForTimeout(600);
const rules = await p.evaluate(() => {
  const out = [];
  const walk = (list) => {
    for (const r of list) {
      if (r.cssRules) walk(r.cssRules);
      const sel = r.selectorText ?? "";
      if (/\.w-(20|24|full)$|\.w-(20|24|full)[,:\s]/.test(sel)) out.push(sel + " -> " + r.style?.cssText);
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }
  return out;
});
console.log(rules.join("\n") || "none");
await b.close();
