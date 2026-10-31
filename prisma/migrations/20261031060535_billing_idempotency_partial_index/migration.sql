-- Enforce invoice billing idempotency: one active (non-cancelled) invoice per subscription per billing period
CREATE UNIQUE INDEX "invoices_subscription_billing_period_start_active_idx" 
ON "invoices"("subscriptionId", "billingPeriodStart") 
WHERE "cancelledAt" IS NULL;
