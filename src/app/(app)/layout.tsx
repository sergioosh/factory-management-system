import { desc, eq, inArray, lt, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, rawMaterials, settings, users } from "@/db/schema";
import { requireSession, can } from "@/lib/session";
import { DEFAULT_ACCENT, themeCss } from "@/lib/theme";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar, type Notice } from "@/components/shell/topbar";
import { Realtime } from "@/components/shell/realtime";

const ACTION_LABELS: Record<string, string> = {
  create: "created",
  update: "updated",
  archive: "archived",
  restore: "restored",
  start: "started",
  complete: "completed",
  cancel: "cancelled",
  payment: "payment recorded",
  create_runs: "production runs created",
  reset_system_data: "system data reset",
};

function noticeText(action: string, entity: string, entityId: string | null): string {
  const e = entity.replaceAll("_", " ");
  const label = e.charAt(0).toUpperCase() + e.slice(1);
  const a = ACTION_LABELS[action] ?? action.replaceAll("_", " ");
  if (action === "reset_system_data") return "System data was reset";
  return `${label}${entityId ? ` #${entityId}` : ""} ${a}`;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const settingRows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["theme_accent", "company_name"]));
  const cfg = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
  const accent = cfg.theme_accent;

  const [approvals] = await db.select({
    n: sql<number>`
      (select count(*) from purchase_requests where status = 'pending')::int
      + (select count(*) from adjustments where status = 'pending')::int
      + (select count(*) from stock_counts where status = 'submitted')::int`,
  }).from(sql`(select 1) as one`);

  const [low] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rawMaterials)
    .where(and(eq(rawMaterials.archived, false), lt(rawMaterials.currentStock, rawMaterials.minStock)));

  const recent = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      createdAt: auditLog.createdAt,
      userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.id))
    .limit(10);

  const activity: Notice[] = recent.map((r) => ({
    id: r.id,
    text: noticeText(r.action, r.entity, r.entityId),
    by: r.userName,
    at: r.createdAt.toISOString(),
  }));

  const canApprove =
    can(session, "purchasing", "approve") || can(session, "inventory", "approve");

  return (
    <div className="flex min-h-screen">
      {accent && accent !== DEFAULT_ACCENT && (
        <style dangerouslySetInnerHTML={{ __html: themeCss(accent) }} />
      )}
      <Sidebar perms={session.perms} companyName={cfg.company_name || "Plastics factory"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={session.user.name}
          roleName={session.user.roleName}
          canApprove={canApprove}
          pendingApprovals={canApprove ? approvals.n : 0}
          lowStock={low.n}
          activity={activity}
        />
        <main className="min-w-0 flex-1 px-6 py-5">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
      </div>
      <Realtime />
    </div>
  );
}
