// Seeds a demo workflow, captures screenshots for the system overview PDF,
// then resets the system back to a clean state.
import { chromium } from "playwright";
import "dotenv/config";
import pg from "pg";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const DIR = "shots";
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(45000);

const shot = (name) => page.screenshot({ path: `${DIR}/${name}.png` });
const settle = (ms = 900) => page.waitForTimeout(ms);
const toast = (text) => page.getByText(text, { exact: false }).first().waitFor();
async function searchSelect(placeholder, optionText, { nth = 0, exact = false } = {}) {
  await page.locator(`button:has(span:text-is("${placeholder}"))`).nth(nth).click();
  await page.getByPlaceholder("Search").last().fill(optionText.slice(0, 14));
  if (exact) await page.getByText(optionText, { exact: true }).last().click();
  else await page.locator(`button:has-text("${optionText}")`).last().click();
}

// -- login page shot, then sign in
await page.goto(`${BASE}/login`);
await settle();
await shot("01-login");
await page.getByLabel(/Email/).fill("admin@factory.local");
await page.getByLabel(/Password/).fill("admin1234");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(`${BASE}/`);

// -- demo customer
await page.goto(`${BASE}/customers`);
await settle();
await page.getByRole("button", { name: "Add customer" }).click();
await page.getByLabel(/^Name/).fill("KAMPALA TRADERS");
await page.getByLabel(/Phone/).fill("0772 456123");
await page.getByLabel(/Location/).fill("Nakasero, Kampala");
await shot("04-customer-form");
await page.getByRole("button", { name: "Save", exact: true }).click();
await toast("Customer");

// -- order with shortfall
await page.goto(`${BASE}/orders`);
await settle();
await page.getByRole("button", { name: "New order" }).click();
await searchSelect("Pick customer", "KAMPALA TRADERS");
await searchSelect("Product", "YOLO STRAW");
await page.getByPlaceholder("Qty").fill("2000");
await page.getByPlaceholder("Rate").fill("4500");
await shot("05-order-form");
await page.getByRole("button", { name: "Save order" }).click();
await page.waitForURL(/\/orders\/\d+/);
const orderUrl = page.url();
await page.getByRole("button", { name: "Confirm order" }).click();
await page.getByRole("button", { name: "Confirm order" }).last().click();
await page.getByText("Raise purchase request").waitFor();
await settle();
await shot("06-order-shortfall");
await page.getByRole("button", { name: /Raise purchase request/ }).click();
await toast("Purchase request raised");

// -- approvals
await page.goto(`${BASE}/approvals`);
await settle();
await shot("07-approvals");
await page.getByRole("button", { name: "Approve", exact: true }).first().click();
await page.getByRole("button", { name: "Approve", exact: true }).last().click();
await toast("Done");

// -- PO + GRN
await page.goto(`${BASE}/purchase-requests`);
await settle();
await page.getByRole("button", { name: "Create PO" }).first().click();
await page.waitForURL(/fromPr/);
await searchSelect("Supplier", "SOMUCHEM");
await shot("08-po-form");
await page.getByRole("button", { name: "Create", exact: true }).click();
await toast("Purchase created");
await page.goto(`${BASE}/grn`);
await settle();
await page.getByRole("button", { name: "Receive goods" }).click();
await searchSelect("PO", "SOMUCHEM");
await settle(500);
await shot("09-grn-form");
await page.getByRole("button", { name: "Receive", exact: true }).click();
await toast("Goods received");

// -- runs + production
await page.goto(orderUrl);
await page.getByText("Covered").waitFor();
await page.getByRole("button", { name: "Create runs" }).click();
await toast("Production runs created");
await page.goto(`${BASE}/production`);
await settle();
await page.getByRole("button", { name: "Complete", exact: true }).first().click();
await page.getByLabel(/Qty produced/).fill("2000");
await settle(400);
await shot("10-production-complete");
await page.getByRole("button", { name: "Complete & post stock" }).click();
await toast("stock updated");

// -- invoice + partial payment
await page.goto(orderUrl);
await page.getByRole("button", { name: "Create invoice" }).click();
await page.getByRole("button", { name: "Create invoice" }).last().click();
await toast("Done");
await page.goto(orderUrl);
await page.getByRole("button", { name: "Record payment" }).click();
await page.getByLabel(/Amount/).fill("5000000");
await page.getByRole("button", { name: "Record payment" }).last().click();
await toast("Payment recorded");
await page.goto(orderUrl);
await settle();
await shot("11-order-complete");

// -- invoice print
const invoiceLink = page.locator('a[href*="/print"]').first();
await invoiceLink.click();
await page.waitForURL(/print/);
await settle();
await shot("12-invoice-print");

// -- overview pages
const pages = [
  ["02-dashboard", "/"],
  ["03-materials", "/materials"],
  ["13-stock", "/stock/materials"],
  ["14-ledger", "/ledger"],
  ["15-sales", "/sales"],
  ["16-payments", "/payments"],
  ["17-report-operational", "/reports/operational"],
  ["18-report-financial", "/reports/financial"],
  ["19-bom", "/bom"],
  ["20-roles", "/roles"],
  ["21-settings", "/settings"],
];
for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`);
  await settle();
  await shot(name);
}

// -- reset back to clean state
await page.goto(`${BASE}/settings`);
await page.getByRole("button", { name: "Reset system data" }).click();
await page.getByPlaceholder("Security key").fill("7x$K!m9_");
await page.getByRole("button", { name: "Reset everything" }).click();
await toast("System data reset");
await browser.close();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`DELETE FROM customers WHERE name = 'KAMPALA TRADERS'`);
await c.end();
console.log("SHOTS DONE");
