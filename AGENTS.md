<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Factory Management System

Workflow-based factory management for a Ugandan plastics/packaging factory (straws, sticks, foil, cling film, plates/lids). Replaces `Factory_Management_Workbook_V6.xlsx`. All money is UGX (no currency handling anywhere). Units are plain text on each item (no UOM master).

## Stack

Next.js 16 App Router + TypeScript (Cache Components NOT enabled — classic `force-dynamic`/`revalidatePath` model), Tailwind v4 (theme tokens in `src/app/globals.css`), Drizzle ORM (`src/db/schema.ts`) on Neon Postgres, Better Auth (`src/lib/auth.ts`), Iconsax icons (`iconsax-reactjs`), sonner toasts, Radix dialog/popover.

Commands: `npm run dev`, `npx tsc --noEmit`, `npm run db:push`, `npm run db:seed`.

## Core flow

Customer → Sales Order → BOM material check → Purchase Request (shortfall) → approval → Purchase → GRN → Production run (actual consumption vs standard = variance) → FG stock → Invoice → Payments (AR).

## Hard rules

- **Stock only moves through `postStockMovement()`** (`src/lib/stock.ts`), inside `db.transaction`. It locks the item row, rejects negative balances, updates `currentStock`, and appends to `stock_ledger`. Lots via `createLot`/`consumeLotsFifo` in the same transaction.
- Document numbers via `nextDocNo(tx, "SO"|"PR"|"PO"|"GRN"|"PRD"|"INV"|"ADJ"|"SC")` inside the transaction.
- Every mutation: `requirePerm(module, action)` first, `writeAudit(...)` after, then `notifyChange(...topics)` + `revalidatePath(...)`.
- Numeric columns use `mode: "number"` — quantities and money are plain `number` in TS.

## Module pattern (copy `src/app/(app)/materials/`)

- `page.tsx` — server component, `export const dynamic = "force-dynamic"`, `requireView("module")`, Drizzle query, pass rows + `can(...)` flags to client component.
- `*-client.tsx` — `"use client"`; `DataTable` for lists, `Sheet` (slide-in, Supabase style) for all create/edit, `useTransition` + sonner `toast` on `ActionResult`.
- `actions.ts` — `"use server"`; zod parse → `act(async () => { ... })` wrapper returns `{ok, error}`.

Permission modules: `masters | orders | purchasing | production | sales | inventory | reports | admin`, actions `view|create|edit|approve` (see `PermissionMap` in schema).

## UI conventions (keep it un-AI)

- Components from `src/components/ui/`: `Button`, `Input/Textarea/Select/Field`, `Sheet`, `Badge/StatusBadge`, `DataTable`, `PageHeader`, `SearchSelect`, `ConfirmDialog`, `Checkbox`, `Menu`, `FilterSelect`. `cn()` from `src/lib/cn.ts`. `Select` is a custom Radix dropdown but keeps the native `<Select><option>` API (drop-in).
- `DataTable` props: `filters` (organised multi-select filter bar — `FilterDef<T>[]` with `getValue`), `exportName`+`exportTitle` (Excel/PDF/CSV menu via `src/lib/export.ts`), `selectable`+`bulkActions(selected, clear)` (custom checkboxes + bulk bar). Sort chevrons show faint at rest. Don't hand-roll filter chips — use `filters`.
- Formatting from `src/lib/format.ts`: `fmtMoney` (no decimals), `fmtQty`, `fmtDate`, `today()`.
- Numbers/codes/money get class `num` (IBM Plex Mono, tabular). Right-align numeric columns.
- Terse labels, no explainer paragraphs, no emoji, one-line empty states. Factory vocabulary (kavera, qty produced, short).
- Theme colors: `bg`, `surface`, `line`, `ink`, `ink-soft`, `ink-faint`, `accent` (green), tones `ok/warn/danger/info` + `-soft` variants.

## Gotchas

- Next 16: `params`/`searchParams` in page props are Promises — `await` them.
- `requireView` redirects; `requirePerm` throws (use in actions only).
- Realtime = `notifyChange()` → pg NOTIFY → SSE (`/api/events`) → `router.refresh()` client-side; nothing else needed per feature.
- Seed admin: `admin@factory.local` / `admin1234`.
