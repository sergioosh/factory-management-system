export type TabKey =
  | "purchases"
  | "production"
  | "sales"
  | "variance"
  | "wastage-material"
  | "wastage-product"
  | "low-stock"
  | "reorder";

export const OP_TABS: { key: TabKey; label: string }[] = [
  { key: "purchases", label: "Purchases" },
  { key: "production", label: "Production" },
  { key: "sales", label: "Sales" },
  { key: "variance", label: "Variance" },
  { key: "wastage-material", label: "Wastage by material" },
  { key: "wastage-product", label: "Wastage by product" },
  { key: "low-stock", label: "Low Stock" },
  { key: "reorder", label: "Reorder Suggestions" },
];
