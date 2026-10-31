-- AlterTable: subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "planPricePaise" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "planMinQuantity" INTEGER DEFAULT 1;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "planName" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "customerGstStateCode" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "lastResumedAt" TIMESTAMP(3);

-- AlterTable: subscription_lines
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "taxRateBps" INTEGER DEFAULT 0;
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "taxAmountPaise" INTEGER DEFAULT 0;
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "productName" TEXT;
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "variantName" TEXT;
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "cgstPaise" INTEGER DEFAULT 0;
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "sgstPaise" INTEGER DEFAULT 0;
ALTER TABLE "subscription_lines" ADD COLUMN IF NOT EXISTS "igstPaise" INTEGER DEFAULT 0;

-- CreateTable: subscription_pause_intervals
CREATE TABLE IF NOT EXISTS "subscription_pause_intervals" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "reason" TEXT,

    CONSTRAINT "subscription_pause_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscription_pause_intervals_subscriptionId_idx" ON "subscription_pause_intervals"("subscriptionId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscription_pause_intervals_subscriptionId_fkey'
    ) THEN
        ALTER TABLE "subscription_pause_intervals"
        ADD CONSTRAINT "subscription_pause_intervals_subscriptionId_fkey"
        FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
