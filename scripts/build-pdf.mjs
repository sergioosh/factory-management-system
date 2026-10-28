// Builds Factory-System-Overview.pdf from the captured screenshots.
import { chromium } from "playwright";
import { readFileSync } from "fs";

const img = (name) =>
  `data:image/png;base64,${readFileSync(`shots/${name}.png`).toString("base64")}`;

const shot = (name, caption) => `
  <figure>
    <img src="${img(name)}" alt="" />
    ${caption ? `<figcaption>${caption}</figcaption>` : ""}
  </figure>`;

const section = (title, body) => `
  <section>
    <h2>${title}</h2>
    ${body}
  </section>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1c1917; font-size: 10.5pt; line-height: 1.55; }
  .cover { height: 257mm; display: flex; flex-direction: column; justify-content: space-between;
           background: #115e3b; color: #fff; padding: 22mm; border-radius: 4mm; }
  .cover .mark { font-size: 13pt; font-weight: 600; letter-spacing: .02em; }
  .cover h1 { font-size: 30pt; font-weight: 650; line-height: 1.15; max-width: 70%; }
  .cover .flow { font-family: Consolas, monospace; font-size: 9.5pt; color: rgba(255,255,255,.75);
                 margin-top: 8mm; letter-spacing: .04em; }
  .cover .meta { font-size: 9.5pt; color: rgba(255,255,255,.6); }
  section { page-break-before: always; }
  h2 { font-size: 15pt; font-weight: 650; color: #115e3b; margin-bottom: 3mm;
       padding-bottom: 2mm; border-bottom: 1.5pt solid #e0ded9; }
  p { margin-bottom: 3mm; }
  ul { margin: 0 0 3mm 5mm; }
  li { margin-bottom: 1.2mm; }
  figure { margin: 4mm 0 2mm; }
  img { width: 100%; border: 1px solid #d6d3d1; border-radius: 2mm; }
  figcaption { font-size: 8.5pt; color: #78716c; margin-top: 1.5mm; }
  .k { font-family: Consolas, monospace; font-size: 9pt; background: #f5f4f2; padding: 0 1mm; border-radius: 1mm; }
  table.spec { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
  table.spec td { padding: 1.6mm 2mm; border-bottom: 1px solid #eceae7; vertical-align: top; }
  table.spec td:first-child { font-weight: 600; width: 34mm; color: #57534e; }
</style></head><body>

<div class="cover">
  <div class="mark">FACTORY — Management System</div>
  <div>
    <h1>One flow from customer order to delivery and payment.</h1>
    <div class="flow">ORDER → MATERIALS → PURCHASE → PRODUCTION → INVOICE → PAYMENT</div>
  </div>
  <div class="meta">System overview · July 2026 · Kampala, Uganda</div>
</div>

${section("What the system does", `
  <p>Factory runs the full operation of the plant — straws, sticks, aluminium foil, cling film,
  plates and lids — in one place. It replaces the spreadsheet workbook with a live system that
  every user shares: 37 finished products, 51 raw materials and the full bill of materials are
  already loaded, and every quantity on screen comes from an auditable stock ledger.</p>
  <p>The system is built around the way an order actually moves through the factory:</p>
  <ul>
    <li><b>Order</b> — a customer order is captured with products, quantities and rates.</li>
    <li><b>Materials</b> — the BOM is exploded automatically and checked against free stock.</li>
    <li><b>Purchase</b> — any shortfall becomes a purchase request, approved, ordered and received.</li>
    <li><b>Production</b> — runs record what was produced and what was actually consumed.</li>
    <li><b>Invoice &amp; payment</b> — finished goods are invoiced and payments tracked to zero balance.</li>
  </ul>
  <p>Every step is permission-controlled, audited, and updates all connected screens in real time.
  All amounts are in Uganda Shillings.</p>
`)}

${section("Signing in", `
  <p>Each staff member has their own account with a role — Admin, Manager, Storekeeper,
  Production or Sales. What a person can see and do is set per role from the admin area.</p>
  ${shot("01-login", "Sign-in screen")}
`)}

${section("Dashboard", `
  <p>The dashboard is the morning view: raw-material stock value, finished goods on hand,
  outstanding receivables and open orders, plus materials running below their minimum,
  runs still in progress, and the latest stock movements. Items awaiting approval are
  one click away.</p>
  ${shot("02-dashboard", "Live overview after a day’s activity")}
`)}

${section("Masters — materials, products, BOM", `
  <p>Raw materials carry a unit, price and minimum stock level; products carry their selling
  price and their bill of materials — the exact quantity of each material needed per unit
  produced. The BOM drives the material check and the production variance report, and can be
  edited line by line as recipes change.</p>
  ${shot("03-materials", "Raw materials with stock levels — low stock highlighted")}
  ${shot("19-bom", "Bill of materials across all products")}
`)}

${section("Taking an order", `
  <p>An order is captured in a slide-in form: customer, date, product lines and rates.
  Customers and suppliers are managed the same way.</p>
  ${shot("05-order-form", "New sales order")}
  <p>Confirming the order runs the material check. The system explodes the BOM across every
  line, subtracts material already reserved by other active orders, and shows exactly what is
  short. One button raises a purchase request for precisely the missing quantities.</p>
  ${shot("06-order-shortfall", "Material check — PP short, one click to raise the purchase request")}
`)}

${section("Approvals", `
  <p>Purchase requests, stock adjustments and stock counts wait in a single approval queue.
  Nothing moves stock or spends money until a user with approval rights signs it off, and
  every decision is recorded with who and when.</p>
  ${shot("07-approvals", "Approval queue with a pending purchase request")}
`)}

${section("Purchasing and receiving", `
  <p>An approved request becomes a purchase order to a supplier — quantities pre-filled,
  rates entered at order time. Goods are received against the PO; part deliveries are
  supported and the order tracks <span class="k">ordered → partial → received</span>
  automatically. Receiving posts stock instantly and creates a traceable lot per material.</p>
  ${shot("08-po-form", "Purchase order pre-filled from the approved request")}
  ${shot("09-grn-form", "Receiving goods — outstanding quantities pre-filled")}
`)}

${section("Production", `
  <p>Production runs are created straight from the order (or standalone). Completing a run
  records the quantity produced and the actual material used — pre-filled from the BOM
  standard, adjusted to reality on the floor. The difference feeds the variance report, so
  material loss is visible per product and per material.</p>
  ${shot("10-production-complete", "Completing a run — standard vs actual consumption, live stock check")}
`)}

${section("Invoice, payment, and the finished order", `
  <p>When production is complete the order is invoiced in one click; finished-goods stock is
  deducted and the printable invoice is ready for the customer. Payments — cash, mobile money
  or bank — are recorded against the invoice until the balance is zero, then the order closes.
  The order page shows the entire chain end to end: request, PO, delivery, runs, invoice and
  balance.</p>
  ${shot("11-order-complete", "The finished order — every stage traceable on one page")}
  ${shot("12-invoice-print", "Printable invoice")}
`)}

${section("Inventory control", `
  <p>Stock never changes silently. Every movement — opening, receipt, production in/out, sale,
  adjustment, count correction — is a line in the stock ledger with its document reference and
  running balance. Lots trace where stock came from; adjustments and physical stock counts go
  through approval before they correct the system.</p>
  ${shot("13-stock", "Raw material stock with values and status")}
  ${shot("14-ledger", "The stock ledger — every movement, its document, and the balance after")}
`)}

${section("Sales and receivables", `
  <p>All invoices live in one register with paid and balance columns. The Payments view keeps
  the money conversation honest: outstanding balance per customer, open invoices, and the
  full payment history.</p>
  ${shot("15-sales", "Invoice register")}
  ${shot("16-payments", "Receivables — who owes what")}
`)}

${section("Reports", `
  <p>Operational reports cover production output, standard-vs-actual consumption variance,
  stock movement and low stock. Financial reports cover sales by customer and product,
  purchases by supplier, receivables aging and stock valuation. Everything filters by date
  range and exports to CSV — as do all the main tables in the system.</p>
  ${shot("17-report-operational", "Production and variance reporting")}
  ${shot("18-report-financial", "Sales, purchases, aging and valuation")}
`)}

${section("Administration", `
  <p>Administration covers user accounts, a role–permission matrix (view / create / edit /
  approve per area), a full audit log of every action, and company settings including the
  accent colour of the interface. A security-key-protected reset can clear all transactions
  and restore opening stock — masters, users and the audit trail stay intact.</p>
  ${shot("20-roles", "Roles and permissions matrix")}
  ${shot("21-settings", "Company settings, theme, and the protected reset")}
`)}

${section("Technical summary", `
  <table class="spec">
    <tr><td>Application</td><td>Next.js (React) web application — works on any modern browser, no installation</td></tr>
    <tr><td>Database</td><td>PostgreSQL (Neon cloud) — every stock movement in an append-only ledger</td></tr>
    <tr><td>Realtime</td><td>Changes made by one user appear on all other screens within a second</td></tr>
    <tr><td>Security</td><td>Individual accounts, role-based permissions, server-side checks, full audit log</td></tr>
    <tr><td>Documents</td><td>Automatic numbering — SO, PR, PO, GRN, PRD, INV, ADJ, SC series</td></tr>
    <tr><td>Data</td><td>37 products, 51 raw materials and complete BOM loaded from the existing workbook</td></tr>
    <tr><td>Verification</td><td>Automated end-to-end test drives all 21 core scenarios through the real interface</td></tr>
    <tr><td>Hosting</td><td>Deployed on Vercel; also runs on a local machine on the factory network</td></tr>
  </table>
  <p>The system is live, seeded, and reset to opening stock — ready for real data entry.</p>
`)}

</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({
  path: "Factory-System-Overview.pdf",
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "16mm", right: "16mm" },
});
await browser.close();
console.log("PDF DONE");
