export type ReportKey =
  | "valuation"
  | "profit"
  | "profit_by_product"
  | "profit_by_customer"
  | "ar_aging";

export const FIN_TABS: { key: ReportKey; label: string }[] = [
  { key: "valuation", label: "Valuation" },
  { key: "profit", label: "Profit" },
  { key: "profit_by_product", label: "Profit by product" },
  { key: "profit_by_customer", label: "Profit by customer" },
  { key: "ar_aging", label: "AR Aging" },
];
