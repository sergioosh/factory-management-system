"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Element3, Box, Box1, TruckFast, Profile2User, Hierarchy, ClipboardText,
  DocumentText, ShoppingCart, TruckTick, Convert3DCube, Receipt21, MoneyRecive,
  BoxSearch, Bag2, ScanBarcode, ArchiveBook, Setting4, Calculator, Chart2,
  Moneys, TickSquare, People, ShieldTick, Clock, Setting2, ArrowLeft2,
} from "iconsax-reactjs";
import type { Icon } from "iconsax-reactjs";
import { cn } from "@/lib/cn";
import type { ModuleKey, PermissionMap } from "@/db/schema";

type Item = { label: string; href: string; icon: Icon; module: ModuleKey | "approvals" };
type Section = { label: string | null; items: Item[] };

export const NAV: Section[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: Element3, module: "reports" }],
  },
  {
    label: "Masters",
    items: [
      { label: "Raw Materials", href: "/materials", icon: Box1, module: "masters" },
      { label: "Products", href: "/products", icon: Box, module: "masters" },
      { label: "Suppliers", href: "/suppliers", icon: TruckFast, module: "masters" },
      { label: "Customers", href: "/customers", icon: Profile2User, module: "masters" },
      { label: "BOM", href: "/bom", icon: Hierarchy, module: "masters" },
    ],
  },
  {
    label: "Transactions",
    items: [
      { label: "Sales Orders", href: "/orders", icon: ClipboardText, module: "orders" },
      { label: "Purchase Requests", href: "/purchase-requests", icon: DocumentText, module: "purchasing" },
      { label: "Purchases", href: "/purchases", icon: ShoppingCart, module: "purchasing" },
      { label: "Goods Received", href: "/grn", icon: TruckTick, module: "purchasing" },
      { label: "Production", href: "/production", icon: Convert3DCube, module: "production" },
      { label: "Sales", href: "/sales", icon: Receipt21, module: "sales" },
      { label: "Payments (AR)", href: "/payments", icon: MoneyRecive, module: "sales" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Raw Material Stock", href: "/stock/materials", icon: BoxSearch, module: "inventory" },
      { label: "Finished Goods Stock", href: "/stock/products", icon: Bag2, module: "inventory" },
      { label: "Lots / Batches", href: "/lots", icon: ScanBarcode, module: "inventory" },
      { label: "Stock Ledger", href: "/ledger", icon: ArchiveBook, module: "inventory" },
      { label: "Adjustments", href: "/adjustments", icon: Setting4, module: "inventory" },
      { label: "Stock Counts", href: "/counts", icon: Calculator, module: "inventory" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Operational", href: "/reports/operational", icon: Chart2, module: "reports" },
      { label: "Financial", href: "/reports/financial", icon: Moneys, module: "reports" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Approvals", href: "/approvals", icon: TickSquare, module: "approvals" },
      { label: "Users", href: "/users", icon: People, module: "admin" },
      { label: "Roles & Permissions", href: "/roles", icon: ShieldTick, module: "admin" },
      { label: "Audit Log", href: "/audit", icon: Clock, module: "admin" },
      { label: "Settings", href: "/settings", icon: Setting2, module: "admin" },
    ],
  },
];

export function Sidebar({
  perms,
  companyName,
}: {
  perms: PermissionMap;
  companyName: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
  }

  const canSee = (item: Item) => {
    if (item.module === "approvals") {
      return Object.values(perms).some((p) => p?.approve);
    }
    return perms[item.module]?.view ?? false;
  };

  return (
    <aside
      className={cn(
        "no-print sticky top-0 flex h-screen shrink-0 flex-col bg-side text-side-ink transition-[width] duration-150",
        collapsed ? "w-[64px]" : "w-[256px]",
      )}
    >
      <div className={cn("flex items-center gap-2.5 pb-3 pt-4", collapsed ? "justify-center px-0" : "px-4")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-[15px] font-bold text-accent-ink">
          F
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[14px] font-semibold text-white">Factory MIS</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-side-soft">
              {companyName}
            </div>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 [scrollbar-width:thin] [scrollbar-color:var(--color-side-line)_transparent]">
        {NAV.map((section) => {
          const items = section.items.filter(canSee);
          if (items.length === 0) return null;
          return (
            <div key={section.label} className="mt-3 first:mt-1">
              {section.label && !collapsed && (
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-side-faint">
                  {section.label}
                </div>
              )}
              {section.label && collapsed && <div className="mx-3 mb-1 mt-2 border-t border-side-line" />}
              {items.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const IconEl = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "mb-0.5 flex items-center gap-2.5 rounded-lg py-[8px] text-[14px] transition-colors",
                      collapsed ? "justify-center px-0" : "px-2.5",
                      active
                        ? "border border-transparent bg-side-raised font-medium text-side-ink ring-1 ring-accent/40"
                        : "border border-transparent text-side-soft hover:bg-white/5 hover:text-side-ink",
                    )}
                  >
                    <IconEl
                      size={17}
                      variant={active ? "Bold" : "Linear"}
                      className={cn("shrink-0", active && "text-accent")}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <button
        onClick={toggle}
        className={cn(
          "flex items-center gap-2 border-t border-side-line py-3 text-[12.5px] text-side-soft hover:text-side-ink cursor-pointer",
          collapsed ? "justify-center" : "px-4",
        )}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <ArrowLeft2 size={14} className={cn("transition-transform", collapsed && "rotate-180")} />
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
