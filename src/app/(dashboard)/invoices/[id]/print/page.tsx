import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import MoneyText from "@/components/ui/MoneyText";

interface InvoicePrintPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function InvoicePrintPage({ params }: InvoicePrintPageProps) {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    redirect("/login");
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          customer: true,
          plan: true,
        },
      },
      lines: {
        include: {
          productVariant: {
            include: { product: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      taxes: true,
      payments: {
        orderBy: { paidAt: "desc" },
      },
    },
  });

  if (!invoice) notFound();

  const isIntraState =
    (invoice.subscription.customerGstStateCode ||
      invoice.subscription.customer.gstStateCode ||
      "27") === "27";

  return (
    <div className="bg-white text-slate-900 min-h-screen p-8 max-w-4xl mx-auto font-sans">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-indigo-700">BRIGHTLOOP</h1>
          <p className="text-xs text-slate-500 mt-0.5">Recurring Subscription Management Platform</p>
          <p className="text-xs text-slate-500">Maharashtra, India • GSTIN: 27AAAAA0000A1Z5</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">TAX INVOICE</span>
          <span className="text-2xl font-bold font-mono text-slate-800">{invoice.number}</span>
          <span className="text-xs text-slate-500 block mt-1">
            Status: <strong className="uppercase">{invoice.status}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 py-6 border-b border-slate-200 text-xs">
        <div>
          <h3 className="font-semibold text-slate-400 uppercase tracking-wider mb-1">BILLED TO:</h3>
          <p className="font-bold text-sm text-slate-800">{invoice.subscription.customer.companyName}</p>
          <p className="text-slate-600 mt-1">{invoice.subscription.customer.billingAddress || "No address on file"}</p>
          <p className="text-slate-600 mt-1">
            <span className="font-semibold">GSTIN:</span> {invoice.subscription.customer.gstin || "Unregistered"}
          </p>
          <p className="text-slate-600">
            <span className="font-semibold">Place of Supply:</span> State Code{" "}
            {invoice.subscription.customerGstStateCode || invoice.subscription.customer.gstStateCode || "27"} (
            {isIntraState ? "Maharashtra" : "Other State"})
          </p>
        </div>

        <div className="text-right space-y-1">
          <p>
            <span className="text-slate-500">Invoice Date:</span>{" "}
            <span className="font-mono font-semibold">{new Date(invoice.createdAt).toLocaleDateString("en-IN")}</span>
          </p>
          <p>
            <span className="text-slate-500">Due Date:</span>{" "}
            <span className="font-mono font-semibold">{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</span>
          </p>
          <p>
            <span className="text-slate-500">Billing Period:</span>{" "}
            <span className="font-mono">
              {new Date(invoice.billingPeriodStart).toLocaleDateString("en-IN")} -{" "}
              {new Date(invoice.billingPeriodEnd).toLocaleDateString("en-IN")}
            </span>
          </p>
          <p>
            <span className="text-slate-500">Contract Ref:</span>{" "}
            <span className="font-mono font-semibold">{invoice.subscription.number}</span>
          </p>
          <p>
            <span className="text-slate-500">Payment Terms:</span>{" "}
            <span>{invoice.subscription.paymentTerms.replace("_", " ")}</span>
          </p>
        </div>
      </div>

      <table className="w-full text-left text-xs my-6">
        <thead className="border-b-2 border-slate-300 bg-slate-50 text-slate-700">
          <tr>
            <th className="py-2.5 px-3">Item / Description</th>
            <th className="py-2.5 px-3 text-center">Qty</th>
            <th className="py-2.5 px-3 text-right">Unit Price</th>
            <th className="py-2.5 px-3 text-right">Amount (INR)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {invoice.lines.map((l) => (
            <tr key={l.id}>
              <td className="py-2.5 px-3">
                <div className="font-semibold text-slate-800">{l.description || l.productVariant.name}</div>
                <div className="text-[11px] text-slate-500">{l.productVariant.product.name}</div>
              </td>
              <td className="py-2.5 px-3 text-center font-mono">{l.quantity}</td>
              <td className="py-2.5 px-3 text-right font-mono">
                <MoneyText paise={l.unitPricePaise} />
              </td>
              <td className="py-2.5 px-3 text-right font-mono font-semibold">
                <MoneyText paise={l.subtotalPaise} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end pt-4 border-t border-slate-200">
        <div className="w-64 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <MoneyText paise={invoice.subtotalPaise} className="font-mono" />
          </div>

          {invoice.taxes.map((t) => (
            <div key={t.id} className="flex justify-between text-slate-600">
              <span>
                {t.taxName} ({t.rateBps / 100}%):
              </span>
              <MoneyText paise={t.amountPaise} className="font-mono" />
            </div>
          ))}

          <div className="flex justify-between text-slate-600 font-semibold border-t border-slate-200 pt-2">
            <span>Total Tax:</span>
            <MoneyText paise={invoice.taxPaise} className="font-mono" />
          </div>

          <div className="flex justify-between text-sm font-bold border-t-2 border-slate-800 pt-2 text-slate-900">
            <span>Total Invoiced:</span>
            <MoneyText paise={invoice.totalPaise} className="font-mono text-indigo-700" />
          </div>

          <div className="flex justify-between text-xs text-slate-600 pt-1">
            <span>Amount Paid:</span>
            <MoneyText paise={invoice.paidPaise} className="font-mono font-semibold text-emerald-700" />
          </div>

          <div className="flex justify-between text-xs font-bold border-t border-slate-200 pt-1 text-slate-800">
            <span>Balance Due:</span>
            <MoneyText paise={Math.max(0, invoice.totalPaise - invoice.paidPaise)} className="font-mono text-amber-900" />
          </div>
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-slate-200 text-[11px] text-slate-500 text-center">
        Thank you for your business. This is a computer-generated tax invoice and requires no physical signature.
      </div>
    </div>
  );
}
