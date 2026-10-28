import type { PermissionMap } from "@/db/schema";

// ---- Granular permission taxonomy (source of truth for roles) ----

export type Section = { id: string; label: string };

export const SECTIONS: Section[] = [
  { id: "masters", label: "Masters (data setup)" },
  { id: "sales_order", label: "Sales Orders (workflow)" },
  { id: "sale", label: "Sales (invoices)" },
  { id: "payment", label: "Payments (Accounts Receivable)" },
  { id: "purchase", label: "Purchases (invoices)" },
  { id: "grn", label: "Goods Received Notes" },
  { id: "production", label: "Production" },
  { id: "inventory", label: "Inventory" },
  { id: "approval", label: "Approvals (maker-checker)" },
  { id: "report", label: "Reports" },
  { id: "audit", label: "Audit" },
  { id: "admin", label: "Administration" },
];

export type Permission = { key: string; section: string; label: string };

export const PERMISSIONS: Permission[] = [
  { key: "master.bom.manage", section: "masters", label: "manage (full CRUD)" },
  { key: "master.bom.view", section: "masters", label: "view" },
  { key: "master.customer.manage", section: "masters", label: "manage (full CRUD)" },
  { key: "master.customer.view", section: "masters", label: "view" },
  { key: "master.material.manage", section: "masters", label: "manage (full CRUD)" },
  { key: "master.material.view", section: "masters", label: "view" },
  { key: "master.product.manage", section: "masters", label: "manage (full CRUD)" },
  { key: "master.product.view", section: "masters", label: "view" },
  { key: "master.supplier.manage", section: "masters", label: "manage (full CRUD)" },
  { key: "master.supplier.view", section: "masters", label: "view" },

  { key: "sales_order.advance", section: "sales_order", label: "advance through workflow" },
  { key: "sales_order.cancel", section: "sales_order", label: "cancel" },
  { key: "sales_order.create", section: "sales_order", label: "create" },
  { key: "sales_order.manage", section: "sales_order", label: "manage (full CRUD)" },
  { key: "sales_order.view", section: "sales_order", label: "view" },

  { key: "sale.create", section: "sale", label: "create" },
  { key: "sale.post", section: "sale", label: "post / submit" },
  { key: "sale.reverse", section: "sale", label: "reverse" },
  { key: "sale.view", section: "sale", label: "view" },

  { key: "payment.create", section: "payment", label: "create" },
  { key: "payment.post", section: "payment", label: "post / submit" },
  { key: "payment.reverse", section: "payment", label: "reverse" },
  { key: "payment.view", section: "payment", label: "view" },

  { key: "purchase.create", section: "purchase", label: "create" },
  { key: "purchase.post", section: "purchase", label: "post / submit" },
  { key: "purchase.reverse", section: "purchase", label: "reverse" },
  { key: "purchase.view", section: "purchase", label: "view" },

  { key: "grn.create", section: "grn", label: "create" },
  { key: "grn.post", section: "grn", label: "post / submit" },
  { key: "grn.reverse", section: "grn", label: "reverse" },
  { key: "grn.view", section: "grn", label: "view" },

  { key: "production.cancel", section: "production", label: "cancel" },
  { key: "production.create", section: "production", label: "create" },
  { key: "production.post", section: "production", label: "post / submit" },
  { key: "production.reverse", section: "production", label: "reverse" },
  { key: "production.view", section: "production", label: "view" },

  { key: "inventory.adjust", section: "inventory", label: "adjust" },
  { key: "inventory.count", section: "inventory", label: "do stock counts" },
  { key: "inventory.view", section: "inventory", label: "view" },

  { key: "approval.decide", section: "approval", label: "approve / reject requests" },
  { key: "approval.view", section: "approval", label: "view" },

  { key: "report.financial.view", section: "report", label: "financial" },
  { key: "report.operational.view", section: "report", label: "operational" },

  { key: "audit.view", section: "audit", label: "view" },

  { key: "admin.role.manage", section: "admin", label: "manage (full CRUD)" },
  { key: "admin.setting.manage", section: "admin", label: "manage (full CRUD)" },
  { key: "admin.user.manage", section: "admin", label: "manage (full CRUD)" },
];

export const ALL_KEYS = PERMISSIONS.map((p) => p.key);
export const ADMIN_ROLE = "Admin";

/**
 * Coerce whatever is stored in `roles.permissions` into a valid granular-key array.
 * Defends against legacy rows that still hold the old per-module PermissionMap shape
 * (or any other malformed jsonb) so a bad row can't crash rendering — see
 * scripts/mig-perms.ts for the one-time data migration this backstops.
 */
export function normalizeKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((k): k is string => typeof k === "string" && ALL_KEYS.includes(k));
}

// ---- Seed roles ----

export const ROLE_DEFAULTS: { name: string; isSystem: boolean; keys: string[] }[] = [
  { name: "Admin", isSystem: true, keys: ALL_KEYS },
  {
    name: "Store Keeper",
    isSystem: false,
    keys: [
      "master.bom.view", "master.material.view", "master.product.view", "master.supplier.view",
      "sales_order.view",
      "purchase.create", "purchase.post", "purchase.reverse", "purchase.view",
      "grn.create", "grn.post", "grn.reverse", "grn.view",
      "inventory.adjust", "inventory.count", "inventory.view",
      "approval.view",
      "report.operational.view",
    ],
  },
  {
    name: "Production Officer",
    isSystem: false,
    keys: [
      "master.bom.manage", "master.bom.view", "master.material.view", "master.product.view",
      "sales_order.view", "sales_order.advance",
      "production.cancel", "production.create", "production.post", "production.reverse", "production.view",
      "inventory.view",
      "approval.view",
      "report.operational.view",
    ],
  },
  {
    name: "Sales Officer",
    isSystem: false,
    keys: [
      "master.customer.manage", "master.customer.view", "master.product.view",
      "sales_order.advance", "sales_order.cancel", "sales_order.create", "sales_order.manage", "sales_order.view",
      "sale.create", "sale.post", "sale.reverse", "sale.view",
      "payment.create", "payment.post", "payment.reverse", "payment.view",
      "inventory.view",
      "approval.view",
      "report.operational.view",
    ],
  },
  {
    name: "Accountant",
    isSystem: false,
    keys: [
      "master.customer.view", "master.material.view", "master.product.view", "master.supplier.view",
      "sales_order.view",
      "sale.view",
      "payment.create", "payment.post", "payment.reverse", "payment.view",
      "purchase.view",
      "production.view",
      "inventory.view",
      "approval.view",
      "report.financial.view", "report.operational.view",
      "audit.view",
    ],
  },
  {
    name: "Manager",
    isSystem: false,
    keys: [
      "master.bom.view", "master.customer.view", "master.material.view", "master.product.view", "master.supplier.view",
      "sales_order.advance", "sales_order.cancel", "sales_order.create", "sales_order.manage", "sales_order.view",
      "sale.view", "sale.reverse",
      "payment.view", "payment.reverse",
      "purchase.view", "purchase.reverse",
      "grn.view", "grn.post",
      "production.view", "production.post",
      "inventory.adjust", "inventory.count", "inventory.view",
      "approval.view", "approval.decide",
      "report.financial.view", "report.operational.view",
      "audit.view",
    ],
  },
];

// ---- Adapter: derive the coarse module map the app enforces on from granular keys ----

export function deriveModulePerms(keys: string[]): PermissionMap {
  const has = (k: string) => keys.includes(k);
  const anyMasterView = keys.some((k) => k.startsWith("master.") && k.endsWith(".view"));
  const anyMasterManage = keys.some((k) => k.startsWith("master.") && k.endsWith(".manage"));
  return {
    masters: { view: anyMasterView, create: anyMasterManage, edit: anyMasterManage, approve: false },
    orders: {
      view: has("sales_order.view"),
      create: has("sales_order.create"),
      edit: has("sales_order.manage") || has("sales_order.cancel"),
      approve: has("sales_order.advance"),
    },
    sales: {
      view: has("sale.view") || has("payment.view"),
      create: has("sale.create") || has("sale.post") || has("payment.create") || has("payment.post"),
      edit: has("sale.reverse") || has("payment.reverse"),
      approve: false,
    },
    purchasing: {
      view: has("purchase.view") || has("grn.view"),
      create: has("purchase.create") || has("purchase.post") || has("grn.create") || has("grn.post"),
      edit: has("purchase.reverse") || has("grn.reverse"),
      approve: has("approval.decide"),
    },
    production: {
      view: has("production.view"),
      create: has("production.create"),
      edit: has("production.post") || has("production.reverse") || has("production.cancel"),
      approve: false,
    },
    inventory: {
      view: has("inventory.view"),
      create: has("inventory.adjust") || has("inventory.count"),
      edit: has("inventory.adjust"),
      approve: has("inventory.count") || has("approval.decide"),
    },
    reports: {
      view: has("report.financial.view") || has("report.operational.view"),
      create: false,
      edit: false,
      approve: false,
    },
    admin: {
      view: has("admin.user.manage") || has("admin.role.manage") || has("admin.setting.manage") || has("audit.view"),
      create: has("admin.user.manage") || has("admin.role.manage"),
      edit: has("admin.user.manage") || has("admin.role.manage") || has("admin.setting.manage"),
      approve: false,
    },
  };
}

export const ALL_TRUE_PERMS: PermissionMap = {
  masters: { view: true, create: true, edit: true, approve: true },
  orders: { view: true, create: true, edit: true, approve: true },
  sales: { view: true, create: true, edit: true, approve: true },
  purchasing: { view: true, create: true, edit: true, approve: true },
  production: { view: true, create: true, edit: true, approve: true },
  inventory: { view: true, create: true, edit: true, approve: true },
  reports: { view: true, create: true, edit: true, approve: true },
  admin: { view: true, create: true, edit: true, approve: true },
};
