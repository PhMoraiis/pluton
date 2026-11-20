-- AlterTable
ALTER TABLE "PaymentMethod" ADD COLUMN "chargeNextMonth" BOOLEAN NOT NULL DEFAULT false;

-- Cartão de crédito passa a cobrar no mês seguinte por padrão (único dado alterado).
UPDATE "PaymentMethod" SET "chargeNextMonth" = true WHERE "name" = 'Cartão de crédito';
