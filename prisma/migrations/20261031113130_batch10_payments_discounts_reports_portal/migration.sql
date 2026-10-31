-- AlterTable
ALTER TABLE "discount_usages" ADD COLUMN     "amountPaise" INTEGER,
ADD COLUMN     "invoiceId" TEXT;

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "minPurchasePaise" INTEGER,
ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "discountId" TEXT;

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "payments_paymentMethod_idx" ON "payments"("paymentMethod");

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
