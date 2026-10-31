import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import AppShell from "@/components/layout/AppShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Customers are redirected to their self-service portal
  if (session.user.role === Role.CUSTOMER) {
    redirect("/portal/subscriptions");
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}
