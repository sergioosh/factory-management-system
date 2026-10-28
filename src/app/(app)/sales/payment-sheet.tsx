"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fmtMoney, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Sheet } from "@/components/ui/sheet";
import { addPayment } from "./actions";

export function PaymentSheet({
  invoice,
  onClose,
}: {
  invoice: { id: number; invoiceNo: string; total: number; paid: number };
  onClose: () => void;
}) {
  const balance = invoice.total - invoice.paid;
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState<"cash" | "mobile_money" | "bank">("cash");
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState("");
  const [busy, startTransition] = useTransition();

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Payment — ${invoice.invoiceNo}`}
      description={`Balance UGX ${fmtMoney(balance)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || amount <= 0}
            onClick={() =>
              startTransition(async () => {
                const res = await addPayment({
                  invoiceId: invoice.id,
                  amount,
                  paymentDate,
                  method,
                  reference: reference || undefined,
                });
                if (!res.ok) return void toast.error(res.error);
                toast.success("Payment recorded");
                onClose();
              })
            }
          >
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Amount (UGX)" required>
          <NumberInput
            className="num"
            value={amount}
            onChange={setAmount}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="bank">Bank</option>
            </Select>
          </Field>
          <Field label="Date">
            <DatePicker value={paymentDate} onChange={setPaymentDate} />
          </Field>
        </div>
        <Field label="Reference">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Txn ID / cheque no"
          />
        </Field>
      </div>
    </Sheet>
  );
}
