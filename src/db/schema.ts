import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });
const money = (name: string) => numeric(name, { precision: 16, scale: 2, mode: "number" });

// ---------- Auth (Better Auth) ----------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  roleId: integer("role_id").references(() => roles.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Roles / audit / settings ----------

export type ModuleKey =
  | "masters"
  | "orders"
  | "purchasing"
  | "production"
  | "sales"
  | "inventory"
  | "reports"
  | "admin";

export type ModulePerms = { view: boolean; create: boolean; edit: boolean; approve: boolean };
export type PermissionMap = Record<ModuleKey, ModulePerms>;

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // Granular permission keys granted to this role (see src/lib/permissions.ts).
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  isSystem: boolean("is_system").notNull().default(false),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------- Masters ----------

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  code: text("code").unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  contactPerson: text("contact_person"),
  email: text("email"),
  location: text("location"),
  creditLimit: money("credit_limit").notNull().default(0),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  code: text("code").unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  contactPerson: text("contact_person"),
  email: text("email"),
  location: text("location"),
  currency: text("currency"),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  piecesPerCarton: integer("pieces_per_carton"),
  sellingPrice: money("selling_price").notNull().default(0),
  currentStock: qty("current_stock").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rawMaterials = pgTable("raw_materials", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  price: money("price").notNull().default(0), // standard cost
  avgCost: money("avg_cost").notNull().default(0), // moving average, recalculated on every GRN
  minStock: qty("min_stock").notNull().default(0),
  currentStock: qty("current_stock").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bomItems = pgTable(
  "bom_items",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => rawMaterials.id, { onDelete: "cascade" }),
    qtyPerUnit: qty("qty_per_unit").notNull(),
    scrapPct: numeric("scrap_pct", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("bom_product_material_idx").on(t.productId, t.materialId)],
);

/** History of BOM recipes. Each save supersedes the previous; bom_items always holds the latest. */
export const bomVersions = pgTable("bom_versions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  effectiveDate: date("effective_date").notNull(),
  materials: integer("materials").notNull().default(0),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Document numbering ----------

export const docCounters = pgTable("doc_counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

// ---------- Sales orders ----------

export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  orderNo: text("order_no").notNull().unique(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  orderDate: date("order_date").notNull(),
  targetDate: date("target_date"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("draft"), // draft|confirmed|in_production|ready|invoiced|closed|cancelled
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => salesOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  qty: qty("qty").notNull(),
  rate: money("rate").notNull().default(0),
});

// ---------- Purchasing ----------

export const purchaseRequests = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  prNo: text("pr_no").notNull().unique(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id),
  status: text("status").notNull().default("pending"), // pending|approved|rejected|ordered
  notes: text("notes"),
  requestedBy: text("requested_by").references(() => users.id),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id")
    .notNull()
    .references(() => purchaseRequests.id, { onDelete: "cascade" }),
  materialId: integer("material_id")
    .notNull()
    .references(() => rawMaterials.id),
  qty: qty("qty").notNull(),
  note: text("note"),
});

// Purchase invoices — the supplier bill; matches goods already received via GRNs.
export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  poNo: text("po_no").notNull().unique(), // internal doc #
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  prId: integer("pr_id").references(() => purchaseRequests.id),
  orderDate: date("order_date").notNull(), // invoice date
  status: text("status").notNull().default("posted"), // posted
  invoiceNo: text("invoice_no"), // supplier's invoice #
  currency: text("currency"),
  fxRate: numeric("fx_rate", { precision: 14, scale: 6, mode: "number" }).notNull().default(1),
  taxRate: numeric("tax_rate", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
  total: money("total").notNull().default(0),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id")
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  materialId: integer("material_id")
    .notNull()
    .references(() => rawMaterials.id),
  qty: qty("qty").notNull(),
  rate: money("rate").notNull().default(0),
  receivedQty: qty("received_qty").notNull().default(0),
});

// Goods received — storekeeper receipt; posts stock IN immediately. Standalone (supplier + materials).
export const goodsReceived = pgTable("goods_received", {
  id: serial("id").primaryKey(),
  grnNo: text("grn_no").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  purchaseId: integer("purchase_id").references(() => purchases.id), // supplier invoice that matched this GRN
  prId: integer("pr_id").references(() => purchaseRequests.id), // optional originating request
  receivedDate: date("received_date").notNull(),
  status: text("status").notNull().default("received"), // received|invoiced
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const grnItems = pgTable("grn_items", {
  id: serial("id").primaryKey(),
  grnId: integer("grn_id")
    .notNull()
    .references(() => goodsReceived.id, { onDelete: "cascade" }),
  materialId: integer("material_id")
    .notNull()
    .references(() => rawMaterials.id),
  qty: qty("qty").notNull(),
  rate: money("rate").notNull().default(0),
  lotId: integer("lot_id").references(() => lots.id),
});

// ---------- Production ----------

export const productionRuns = pgTable("production_runs", {
  id: serial("id").primaryKey(),
  runNo: text("run_no").notNull().unique(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id),
  plannedQty: qty("planned_qty").notNull(),
  producedQty: qty("produced_qty"),
  varianceQty: qty("variance_qty"), // producedQty − plannedQty; negative = short of plan, positive = over
  varianceRemarks: text("variance_remarks"), // why output came in above/below plan — entered at completion
  status: text("status").notNull().default("planned"), // planned|in_progress|completed|cancelled
  runDate: date("run_date").notNull(),
  shift: text("shift"),     // A | B | C — optional
  machine: text("machine"), // optional free text
  operator: text("operator"), // optional free text
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productionConsumption = pgTable("production_consumption", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => productionRuns.id, { onDelete: "cascade" }),
  materialId: integer("material_id")
    .notNull()
    .references(() => rawMaterials.id),
  standardQty: qty("standard_qty").notNull().default(0),
  actualQty: qty("actual_qty"),
  wastedQty: qty("wasted_qty"), // scrapped/spoiled portion of actualQty — does not return to stock
  excessQty: qty("excess_qty"), // unused leftover portion of actualQty — returnable to stock
  returnedQty: qty("returned_qty"), // set only when the user manually posts the excess back to stock
  remarks: text("remarks"), // free-text note entered per material at completion
});

// ---------- Sales / AR ----------

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id),
  invoiceDate: date("invoice_date").notNull(),
  taxRate: numeric("tax_rate", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
  total: money("total").notNull().default(0),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  qty: qty("qty").notNull(),
  rate: money("rate").notNull().default(0),
});

// Customer payments — recorded against a customer and allocated across invoices (FIFO).
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  payNo: text("pay_no").unique(),
  customerId: integer("customer_id").references(() => customers.id),
  invoiceId: integer("invoice_id").references(() => invoices.id), // legacy single-invoice link
  amount: money("amount").notNull(),
  paymentDate: date("payment_date").notNull(),
  method: text("method").notNull().default("cash"), // cash|mobile_money|bank
  currency: text("currency"),
  fxRate: numeric("fx_rate", { precision: 14, scale: 6, mode: "number" }).notNull().default(1),
  reference: text("reference"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: money("amount").notNull(),
});

// ---------- Adjustments / stock counts ----------

export const adjustments = pgTable("adjustments", {
  id: serial("id").primaryKey(),
  adjNo: text("adj_no").notNull().unique(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending|approved|rejected
  sourceCountId: integer("source_count_id").references(() => stockCounts.id),
  requestedBy: text("requested_by").references(() => users.id),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adjustmentItems = pgTable("adjustment_items", {
  id: serial("id").primaryKey(),
  adjId: integer("adj_id")
    .notNull()
    .references(() => adjustments.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(), // rm|fg
  itemId: integer("item_id").notNull(),
  qtyDelta: qty("qty_delta").notNull(),
});

export const stockCounts = pgTable("stock_counts", {
  id: serial("id").primaryKey(),
  countNo: text("count_no").notNull().unique(),
  countDate: date("count_date").notNull(),
  scope: text("scope").notNull().default("rm"), // rm|fg|all
  status: text("status").notNull().default("draft"), // draft|submitted|approved|rejected
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stockCountItems = pgTable("stock_count_items", {
  id: serial("id").primaryKey(),
  countId: integer("count_id")
    .notNull()
    .references(() => stockCounts.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(), // rm|fg
  itemId: integer("item_id").notNull(),
  systemQty: qty("system_qty").notNull(),
  countedQty: qty("counted_qty"),
});

// ---------- Inventory core ----------

export const lots = pgTable(
  "lots",
  {
    id: serial("id").primaryKey(),
    lotNo: text("lot_no").notNull().unique(),
    itemType: text("item_type").notNull(), // rm|fg
    itemId: integer("item_id").notNull(),
    initialQty: qty("initial_qty").notNull(),
    remainingQty: qty("remaining_qty").notNull(),
    sourceType: text("source_type").notNull(), // opening|grn|production|adjustment
    sourceId: integer("source_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("lots_item_idx").on(t.itemType, t.itemId)],
);

export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: serial("id").primaryKey(),
    itemType: text("item_type").notNull(), // rm|fg
    itemId: integer("item_id").notNull(),
    txnType: text("txn_type").notNull(), // opening|grn|production_out|production_in|sale|adjustment|count
    qtyIn: qty("qty_in").notNull().default(0),
    qtyOut: qty("qty_out").notNull().default(0),
    balanceAfter: qty("balance_after").notNull(),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    refNo: text("ref_no"),
    lotId: integer("lot_id").references(() => lots.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_item_idx").on(t.itemType, t.itemId),
    index("ledger_created_idx").on(t.createdAt),
  ],
);
