import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalAccountClient from "@/components/portal/PortalAccountClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account Settings — Brightloop Customer Portal",
};

export default async function PortalAccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { customer: true },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <PortalAccountClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
      }}
      customer={
        user.customer
          ? {
              id: user.customer.id,
              companyName: user.customer.companyName,
              gstin: user.customer.gstin,
              gstState: user.customer.gstState,
              gstStateCode: user.customer.gstStateCode,
              billingAddress: user.customer.billingAddress,
              phone: user.customer.phone,
            }
          : null
      }
    />
  );
}
