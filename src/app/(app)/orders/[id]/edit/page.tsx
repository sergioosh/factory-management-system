import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, salesOrderItems, salesOrders } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { OrderFormClient } from "../../order-form-client";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireView("orders");
  if (!can(session, "orders", "edit")) redirect("/orders");

  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id));
  if (!order) notFound();
  if (order.status !== "draft") redirect(`/orders/${id}`);

  const [items, customerList, productList] = await Promise.all([
    db.select().from(salesOrderItems).where(eq(salesOrderItems.orderId, id)),
    db
      .select({ id: customers.id, name: customers.name, code: customers.code })
      .from(customers)
      .where(eq(customers.archived, false)),
    db
      .select({ id: products.id, code: products.code, name: products.name, sellingPrice: products.sellingPrice })
      .from(products)
      .where(eq(products.archived, false)),
  ]);

  return (
    <OrderFormClient
      mode="edit"
      customers={customerList}
      products={productList}
      initial={{
        id: order.id,
        orderNo: order.orderNo,
        customerId: order.customerId,
        orderDate: order.orderDate,
        targetDate: order.targetDate,
        taxRate: order.taxRate,
        notes: order.notes,
        items: items.map((i) => ({ productId: i.productId, qty: i.qty, rate: i.rate })),
      }}
    />
  );
}
