// Full end-to-end verification: every module's CRUD + the complete workflow.
// Requires `npm run dev` on :3000. Leaves the DB reset to opening state.
import { chromium } from "playwright";
import "dotenv/config";
import pg from "pg";

const BASE = "http://localhost:3000";
const KEY = "7x$K!m9_";
const SHOTS = process.env.TEMP ? `${process.env.TEMP}/factory-test` : ".";
import { mkdirSync } from "fs";
try { mkdirSync(SHOTS, { recursive: true }); } catch {}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(45000);

const results = [];
let failures = 0;

async function section(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures++;
    const shot = `${SHOTS}/FAIL-${name.replaceAll(/\W+/g, "_")}.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    results.push(`FAIL  ${name} — ${String(e).slice(0, 200)} [${shot}]`);
    console.log(`FAIL  ${name} — ${String(e).slice(0, 200)}`);
  }
}

async function searchSelect(placeholder, optionText, { nth = 0, exact = false } = {}) {
  await page.locator(`button:has(span:text-is("${placeholder}"))`).nth(nth).click();
  await page.getByPlaceholder("Search").last().fill(optionText.slice(0, 14));
  if (exact) await page.getByText(optionText, { exact: true }).last().click();
  else await page.locator(`button:has-text("${optionText}")`).last().click();
}
const toast = (text) => page.getByText(text, { exact: false }).first().waitFor();
const settle = () => page.waitForTimeout(800);
// custom Radix Select: click the trigger inside the field label, then the option
async function pickSelect(labelText, optionText) {
  await page.locator(`label:has-text("${labelText}") button`).first().click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

async function login(email, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`);
}

// ---------------------------------------------------------------- run

await section("login admin", () => login("admin@factory.local", "admin1234"));

await section("reset: wrong key rejected", async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Reset system data" }).click();
  await page.getByPlaceholder("Security key").fill("wrong-key");
  await page.getByRole("button", { name: "Reset everything" }).click();
  await toast("Wrong security key");
  await page.getByRole("button", { name: "Cancel" }).click();
});

await section("reset: correct key wipes", async () => {
  await page.getByRole("button", { name: "Reset system data" }).click();
  await page.getByPlaceholder("Security key").fill(KEY);
  await page.getByRole("button", { name: "Reset everything" }).click();
  await toast("System data reset");
});

await section("material create + edit (full page form)", async () => {
  await page.goto(`${BASE}/materials`);
  await settle();
  await page.getByRole("link", { name: "Add material" }).click();
  await page.waitForURL(/\/materials\/new/);
  await settle(400);
  await page.getByLabel(/^Name/).fill("TEST TAPE");
  await page.getByLabel(/Standard cost/).fill("500");
  await page.getByLabel(/Reorder level/).fill("100");
  await page.getByRole("button", { name: "Create material" }).click();
  await toast("Material created");
  await page.waitForURL(`${BASE}/materials`);
  await page.getByPlaceholder("Search materials").fill("TEST TAPE");
  await page.getByRole("row", { name: /TEST TAPE/ }).getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\/materials\/\d+\/edit/);
  await settle(400);
  await page.getByLabel(/Standard cost/).fill("550");
  await page.getByRole("button", { name: "Save changes" }).click();
  await toast("Material updated");
  await page.waitForURL(`${BASE}/materials`);
});

await section("product create with BOM (full page form)", async () => {
  await page.goto(`${BASE}/products`);
  await settle();
  await page.getByRole("link", { name: "Add product" }).click();
  await page.waitForURL(/\/products\/new/);
  await settle(400);
  const codeInput = page.locator("input.num").first();
  const suggestedCode = await codeInput.inputValue();
  if (!/^FG\d+$/.test(suggestedCode)) throw new Error(`unexpected suggested code: ${suggestedCode}`);
  await page.getByLabel(/^Name/).fill("TEST WRAP");
  await page.getByLabel(/Selling price/).fill("20000");
  await page.getByRole("button", { name: "Add material" }).click();
  await searchSelect("Material", "PP", { nth: 0, exact: true });
  await page.getByPlaceholder("Qty/unit").nth(0).fill("0.5");
  await page.getByRole("button", { name: "Add material" }).click();
  await searchSelect("Material", "TEST TAPE", { nth: 0 });
  await page.getByPlaceholder("Qty/unit").nth(1).fill("0.2");
  await page.getByRole("button", { name: "Create product" }).click();
  await toast("Product created");
  await page.waitForURL(`${BASE}/products`);
});

await section("supplier + customer create (full page form)", async () => {
  await page.goto(`${BASE}/suppliers`);
  await settle();
  await page.getByRole("link", { name: "Add supplier" }).click();
  await page.waitForURL(/\/suppliers\/new/);
  await settle(400);
  await page.getByLabel(/^Name/).fill("TEST SUPPLIES LTD");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await toast("Supplier created");
  await page.waitForURL(`${BASE}/suppliers`);

  await page.goto(`${BASE}/customers`);
  await settle();
  await page.getByRole("link", { name: "Add customer" }).click();
  await page.waitForURL(/\/customers\/new/);
  await settle(400);
  await page.getByLabel(/^Name/).fill("TEST BUYER");
  await page.getByRole("button", { name: "Create customer" }).click();
  await toast("Customer created");
  await page.waitForURL(`${BASE}/customers`);
});

await section("bom version editor (full page)", async () => {
  await page.goto(`${BASE}/bom`);
  await settle();
  await page.getByPlaceholder("Search code or name").fill("TEST WRAP");
  await settle(300);
  await page.getByRole("row", { name: /TEST WRAP/ }).getByRole("link", { name: "Open" }).click();
  await page.waitForURL(/\/bom\/\d+$/);
  await settle(400);
  await page.getByPlaceholder("Qty").first().fill("0.25");
  await page.getByRole("button", { name: "Save as new version" }).click();
  await toast("Saved BOM v");
  await page.waitForURL(`${BASE}/bom`);
});

await section("adjustment posts immediately + moves stock", async () => {
  await page.goto(`${BASE}/adjustments`);
  await settle();
  await page.getByRole("link", { name: "New adjustment" }).click();
  await page.waitForURL(/\/adjustments\/new/);
  await settle(400);
  await searchSelect("— pick item —", "TEST TAPE");
  await page.getByLabel(/Qty change/).fill("50");
  await page.getByLabel(/Reason/).fill("Opening top-up");
  await page.getByRole("button", { name: "Post adjustment" }).click();
  await toast("stock updated");
  await page.goto(`${BASE}/stock/materials`);
  await page.getByPlaceholder(/Search/).fill("TEST TAPE");
  await page.getByRole("row", { name: /TEST TAPE/ }).getByText("50", { exact: true }).waitFor();
});

await section("stock count full cycle", async () => {
  await page.goto(`${BASE}/counts`);
  await settle();
  await page.getByRole("link", { name: "New count" }).click();
  await page.waitForURL(/\/counts\/new/);
  await settle(400);
  await pickSelect("Scope", "Finished goods");
  await page.getByRole("button", { name: "Open count" }).click();
  await page.waitForURL(/\/counts\/\d+$/);
  const inputs = page.locator('input[type="number"]');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill("0");
  await page.getByRole("row", { name: /TEST WRAP/ }).locator("input").fill("3");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toast("Count saved");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await toast("Count submitted");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).last().click();
  await toast("Count approved");
  await page.goto(`${BASE}/stock/products`);
  await page.getByPlaceholder(/Search/).fill("TEST WRAP");
  await page.getByRole("row", { name: /TEST WRAP/ }).getByText("3", { exact: true }).first().waitFor();
});

await section("PR -> approve -> standalone GRN -> purchase invoice", async () => {
  await page.goto(`${BASE}/purchase-requests`);
  await settle();
  await page.getByRole("link", { name: "New request" }).click();
  await page.waitForURL(/\/purchase-requests\/new/);
  await settle(400);
  await searchSelect("Material", "TEST TAPE");
  await page.getByPlaceholder("Qty").last().fill("100");
  await page.getByRole("button", { name: "Create request" }).click();
  await toast("Request created");
  await page.waitForURL(`${BASE}/purchase-requests`);

  await page.goto(`${BASE}/approvals`);
  await page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await page.getByRole("button", { name: "Approve", exact: true }).last().click();
  await toast("Done");

  // Receive from the PR: standalone GRN, prefilled lines, posts stock on save
  await page.goto(`${BASE}/purchase-requests`);
  await settle();
  await page.getByRole("row", { name: /PR-/ }).getByRole("link", { name: "Receive", exact: true }).first().click();
  await page.waitForURL(/\/grn\/new\?fromPr=/);
  await settle(400);
  await searchSelect("— pick supplier —", "TEST SUPPLIES");
  await page.getByRole("button", { name: "Post GRN" }).click();
  await toast("Goods received");
  await page.waitForURL(`${BASE}/grn`);
  // stock rose
  await page.goto(`${BASE}/stock/materials`);
  await page.getByPlaceholder(/Search/).fill("TEST TAPE");
  await page.getByRole("row", { name: /TEST TAPE/ }).getByText("150", { exact: true }).waitFor();

  // Purchase invoice: match the open GRN and post the bill
  await page.goto(`${BASE}/purchases`);
  await settle();
  await page.getByRole("link", { name: "New invoice" }).click();
  await page.waitForURL(/\/purchases\/new/);
  await settle(400);
  await searchSelect("— pick supplier —", "TEST SUPPLIES");
  await page.getByText(/GRN-/).first().click(); // check the matched GRN row
  await page.getByLabel(/Invoice #/).fill("SUP-INV-001");
  await page.getByRole("button", { name: "Post invoice" }).click();
  await toast("Invoice posted");
  await page.waitForURL(`${BASE}/purchases`);
  await page.getByText("SUP-INV-001").first().waitFor();
});

let orderUrl = "";
await section("order hub full flow", async () => {
  await page.goto(`${BASE}/orders`);
  await settle();
  await page.getByRole("link", { name: "New order" }).click();
  await page.waitForURL(/\/orders\/new/);
  await settle(400);
  await searchSelect("Pick customer", "TEST BUYER");
  await searchSelect("Pick product", "TEST WRAP");
  await page.getByPlaceholder("Qty").fill("10");
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await page.waitForURL(/\/orders\/\d+$/);
  orderUrl = page.url();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("button", { name: "Confirm order" }).last().click();
  await page.getByText("Covered").waitFor();
  await page.getByRole("button", { name: "Create runs" }).click();
  await toast("Production runs created");
  await page.goto(`${BASE}/production`);
  await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
  await page.getByLabel(/Good qty/).fill("10");
  await page.getByRole("button", { name: "Complete & post stock" }).click();
  await toast("stock updated");
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Create invoice" }).click();
  await page.getByRole("button", { name: "Create invoice" }).last().click();
  await toast("Done");
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("button", { name: "Record payment" }).last().click();
  await toast("Payment recorded");
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Close order" }).click();
  await toast("Order closed");
});

await section("standalone sale + payments page", async () => {
  await page.goto(`${BASE}/sales`);
  await settle();
  await page.getByRole("link", { name: "New sale" }).click();
  await page.waitForURL(/\/sales\/new/);
  await settle(400);
  await searchSelect("— pick customer —", "TEST BUYER");
  await searchSelect("— pick product —", "TEST WRAP");
  await page.getByPlaceholder("Qty").fill("2");
  await page.getByPlaceholder("Price").fill("21000");
  await page.getByRole("button", { name: "Post sale" }).click();
  await toast("stock deducted");
  await page.goto(`${BASE}/payments`);
  await settle();
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.waitForURL(/\/payments\/new/);
  await settle(400);
  await searchSelect("— pick customer —", "TEST BUYER");
  await page.getByLabel(/Amount received/).fill("20000");
  await page.getByRole("button", { name: "Post payment" }).click();
  await toast("Payment recorded");
  await page.waitForURL(`${BASE}/payments`);
});

await section("standalone production run", async () => {
  await page.goto(`${BASE}/production`);
  await settle();
  await page.getByRole("link", { name: "New production" }).click();
  await page.waitForURL(/\/production\/new/);
  await settle(400);
  await searchSelect("— no products with active BOM —", "TEST WRAP");
  await page.getByLabel(/Qty to produce/).fill("5");
  await page.getByRole("button", { name: "Start production" }).click();
  await toast("Production run created");
  await page.waitForURL(`${BASE}/production`);
  await settle();
  await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
  await page.getByRole("button", { name: "Complete & post stock" }).click();
  await toast("stock updated");
});

await section("users: create + edit (full page form)", async () => {
  await page.goto(`${BASE}/users`);
  await settle();
  await page.getByRole("link", { name: /Add user/ }).click();
  await page.waitForURL(/\/users\/new/);
  await settle(400);
  await page.getByLabel(/^Name/).fill("Store Keeper");
  await page.getByLabel(/Email/).fill("storekeeper@factory.local");
  await page.getByLabel(/Password/).fill("store1234");
  await pickSelect("Role", "Store Keeper");
  await page.getByRole("button", { name: "Add user" }).click();
  await toast("User added");
  await page.waitForURL(`${BASE}/users`);

  await page.getByRole("row", { name: /Store Keeper/ }).click();
  await page.waitForURL(/\/users\/.+\/edit/);
  await settle(400);
  await page.getByLabel(/^Name/).fill("Store Keeper A");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toast("User updated");
  await page.waitForURL(`${BASE}/users`);
});

await section("roles: create, grant, delete via matrix", async () => {
  await page.goto(`${BASE}/roles`);
  await settle();
  await page.getByRole("button", { name: "New role" }).click();
  await page.getByPlaceholder("Role name").fill("Viewer");
  await page.getByRole("button", { name: "Create role" }).click();
  await toast("Role created");
  await settle();
  // grant one permission to Viewer (its column is last) and persist
  await page
    .getByRole("row", { name: /master\.bom\.view/ })
    .locator('input[type="checkbox"]')
    .last()
    .check({ force: true });
  await page.getByRole("button", { name: /Save changes/ }).click();
  await toast("Permissions saved");
  await settle();
  // delete Viewer
  await page.getByTitle("Delete Viewer").click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await toast("Role deleted");
});

await section("audit log shows entries", async () => {
  await page.goto(`${BASE}/audit`);
  await page.getByText("reset_system_data").first().waitFor();
});

await section("reports render with data", async () => {
  await page.goto(`${BASE}/reports/operational?tab=production`);
  await page.getByText("TEST WRAP").first().waitFor();
  await page.goto(`${BASE}/reports/operational?tab=variance`);
  await page.getByText("TEST WRAP").first().waitFor();
  await page.goto(`${BASE}/reports/financial?report=profit_by_customer`);
  await page.getByText("TEST BUYER").first().waitFor();
});

await section("filters + export menu present", async () => {
  await page.goto(`${BASE}/orders`);
  await settle();
  // organised Status filter dropdown
  await page.getByRole("button", { name: /Status/ }).first().click();
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("row", { name: /SO-/ }).first().waitFor(); // closed order visible
  await page.getByRole("button", { name: /Clear filters/ }).click();
  // export menu offers Excel / PDF / CSV
  await page.getByRole("button", { name: /Export/ }).first().click();
  await page.getByRole("menuitem", { name: /Excel/ }).waitFor();
  await page.getByRole("menuitem", { name: /PDF/ }).waitFor();
  await page.keyboard.press("Escape");
});

await section("permissions: storekeeper restricted", async () => {
  await page.getByTitle("Sign out").click();
  await page.waitForURL(/login/);
  await login("storekeeper@factory.local", "store1234");
  const adminLink = await page.getByRole("link", { name: "Users" }).count();
  if (adminLink > 0) throw new Error("Storekeeper sees admin nav");
  await page.goto(`${BASE}/users`);
  await page.waitForURL(`${BASE}/`); // redirected home
  await page.goto(`${BASE}/sales`);
  await page.waitForURL(`${BASE}/`); // no sale view perm
  await page.getByTitle("Sign out").click();
  await page.waitForURL(/login/);
  await login("admin@factory.local", "admin1234");
});

await section("final reset for clean handover", async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Reset system data" }).click();
  await page.getByPlaceholder("Security key").fill(KEY);
  await page.getByRole("button", { name: "Reset everything" }).click();
  await toast("System data reset");
});

await browser.close();

// remove test masters directly (nothing references them after reset)
await section("cleanup test masters", async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(`DELETE FROM bom_items WHERE product_id IN (SELECT id FROM products WHERE name = 'TEST WRAP')`);
  await c.query(`DELETE FROM stock_ledger WHERE item_type='rm' AND item_id IN (SELECT id FROM raw_materials WHERE name='TEST TAPE')`);
  await c.query(`DELETE FROM lots WHERE item_type='rm' AND item_id IN (SELECT id FROM raw_materials WHERE name='TEST TAPE')`);
  await c.query(`DELETE FROM products WHERE name = 'TEST WRAP'`);
  await c.query(`DELETE FROM raw_materials WHERE name = 'TEST TAPE'`);
  await c.query(`DELETE FROM suppliers WHERE name = 'TEST SUPPLIES LTD'`);
  await c.query(`DELETE FROM customers WHERE name = 'TEST BUYER'`);
  await c.query(`DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email='storekeeper@factory.local')`);
  await c.query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email='storekeeper@factory.local')`);
  await c.query(`DELETE FROM users WHERE email = 'storekeeper@factory.local'`);
  await c.end();
});

console.log("\n===== RESULTS =====");
for (const r of results) console.log(r);
console.log(failures === 0 ? "\nALL TESTS PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
