import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT = (n) => `C:/Users/ARKNER~1/AppData/Local/Temp/claude/e--dev-factory/337d975c-8f90-4c46-847a-b8fe1cea32a6/scratchpad/e2e-${n}.png`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(45000);

let step = "start";
async function searchSelect(placeholder, optionText) {
  await page.locator(`button:has-text("${placeholder}")`).first().click();
  const search = page.getByPlaceholder("Search").last();
  await search.fill(optionText.slice(0, 12));
  await page.locator(`button:has-text("${optionText}")`).last().click();
}
async function toastOk(text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 45000 });
}

try {
  // 1. login
  step = "login";
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/Email/).fill("admin@factory.local");
  await page.getByLabel(/Password/).fill("admin1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`);
  console.log("OK login");

  // 2. create customer
  step = "customer";
  await page.goto(`${BASE}/customers`);
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.getByLabel(/^Name/).fill("MUKWANO WHOLESALE");
  await page.getByLabel(/Phone/).fill("0772 000000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toastOk("Customer");
  console.log("OK customer created");

  // 3. create order: YOLO STRAW x 2000 (PP shortfall: needs 2030, stock 1500)
  step = "order-create";
  await page.goto(`${BASE}/orders`);
  await page.getByRole("button", { name: "New order" }).click();
  await searchSelect("Pick customer", "MUKWANO WHOLESALE");
  await searchSelect("Product", "YOLO STRAW");
  await page.getByPlaceholder("Qty").fill("2000");
  await page.getByPlaceholder("Rate").fill("4500");
  await page.getByRole("button", { name: "Save order" }).click();
  await page.waitForURL(/\/orders\/\d+/);
  const orderUrl = page.url();
  console.log("OK order created", orderUrl);

  // 4. confirm order
  step = "order-confirm";
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("button", { name: "Confirm order" }).last().click(); // dialog confirm
  await page.getByText("Covered").or(page.getByText("Raise purchase request")).first().waitFor();
  await page.screenshot({ path: SHOT("material-check"), fullPage: true });
  console.log("OK order confirmed, material check visible");

  // 5. raise PR for shortfall
  step = "raise-pr";
  await page.getByRole("button", { name: /Raise purchase request/ }).click();
  await toastOk("Purchase request raised");
  console.log("OK PR raised");

  // 6. approve PR in approvals queue
  step = "approve-pr";
  await page.goto(`${BASE}/approvals`);
  await page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await page.getByRole("button", { name: "Approve", exact: true }).last().click(); // dialog
  await toastOk("Done");
  console.log("OK PR approved");

  // 7. create PO from PR
  step = "create-po";
  await page.goto(`${BASE}/purchase-requests`);
  await page.getByRole("button", { name: "Create PO" }).first().click();
  await page.waitForURL(/fromPr/);
  await searchSelect("Supplier", "SOMUCHEM");
  const rateInputs = await page.getByPlaceholder("Rate").all();
  for (const r of rateInputs) {
    const v = await r.inputValue();
    if (!v || v === "0") await r.fill("1200");
  }
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await toastOk("Purchase created");
  console.log("OK PO created");

  // 8. receive goods (GRN)
  step = "grn";
  await page.goto(`${BASE}/grn`);
  await page.getByRole("button", { name: "Receive goods" }).click();
  await searchSelect("PO", "SOMUCHEM");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Receive", exact: true }).click();
  await toastOk("Goods received");
  console.log("OK GRN posted");

  // 9. back on order: check covered, create runs
  step = "create-runs";
  await page.goto(orderUrl);
  await page.getByText("Covered").waitFor();
  await page.getByRole("button", { name: "Create runs" }).click();
  await toastOk("Production runs created");
  console.log("OK runs created, materials covered");

  // 10. complete the run (with a variance on FILLER: 380 vs std 400)
  step = "complete-run";
  await page.goto(`${BASE}/production`);
  await page.getByRole("button", { name: "Complete" }).first().click();
  await page.getByLabel(/Qty produced/).fill("2000");
  const fillerRow = page.locator("div.grid", { hasText: "FILLER" }).last();
  await fillerRow.locator("input").fill("380");
  await page.getByRole("button", { name: "Complete & post stock" }).click();
  await toastOk("completed — stock updated");
  console.log("OK run completed");

  // 11. order ready -> create invoice
  step = "invoice";
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Create invoice" }).click();
  await page.getByRole("button", { name: "Create invoice" }).last().click(); // dialog
  await toastOk("Done");
  console.log("OK invoiced");

  // 12. record partial then full payment
  step = "payment";
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel(/Amount/).fill("5000000");
  await page.getByRole("button", { name: "Record payment" }).last().click();
  await toastOk("Payment recorded");
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("button", { name: "Record payment" }).last().click(); // full balance prefilled
  await toastOk("Payment recorded");
  console.log("OK payments recorded");

  // 13. close order
  step = "close";
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Close order" }).click();
  await toastOk("Order closed");
  await page.screenshot({ path: SHOT("order-closed"), fullPage: true });
  console.log("OK order closed");

  // 14. dashboard snapshot
  step = "dashboard";
  await page.goto(BASE);
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOT("dashboard"), fullPage: true });
  console.log("E2E PASS");
} catch (e) {
  await page.screenshot({ path: SHOT(`FAIL-${step}`), fullPage: true });
  console.error(`E2E FAIL at step: ${step}`);
  console.error(String(e).slice(0, 800));
  process.exitCode = 1;
} finally {
  await browser.close();
}
