import React from "react";
import { Role } from "@prisma/client";

interface RoleGuardProps {
  userRole?: Role | null;
  allowedRoles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({
  userRole,
  allowedRoles,
  children,
  fallback = null,
}: RoleGuardProps) {
  if (!userRole || !allowedRoles.includes(userRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export default RoleGuard;
