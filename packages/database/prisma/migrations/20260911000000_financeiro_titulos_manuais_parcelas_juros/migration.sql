-- Financeiro: titulos manuais (Contas a Pagar/Receber sem viagem vinculada),
-- parcelamento e juros/multa/desconto no pagamento/recebimento.
-- Todas as alteracoes sao aditivas (colunas novas nullable, indice novo) ou
-- relaxam uma constraint (DROP NOT NULL) -- nao ha perda de dados.

-- AlterTable
ALTER TABLE "payable_payments" ADD COLUMN     "discount_amount" DECIMAL(12,2),
ADD COLUMN     "fine_amount" DECIMAL(12,2),
ADD COLUMN     "interest_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "installment_group_id" UUID,
ADD COLUMN     "installment_number" INTEGER,
ADD COLUMN     "installment_total" INTEGER,
ALTER COLUMN "trip_id" DROP NOT NULL,
ALTER COLUMN "expense_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "receivable_payments" ADD COLUMN     "discount_amount" DECIMAL(12,2),
ADD COLUMN     "fine_amount" DECIMAL(12,2),
ADD COLUMN     "interest_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "installment_group_id" UUID,
ADD COLUMN     "installment_number" INTEGER,
ADD COLUMN     "installment_total" INTEGER,
ALTER COLUMN "trip_id" DROP NOT NULL,
ALTER COLUMN "billing_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "payables_tenant_id_installment_group_id_idx" ON "payables"("tenant_id", "installment_group_id");

-- CreateIndex
CREATE INDEX "receivables_tenant_id_installment_group_id_idx" ON "receivables"("tenant_id", "installment_group_id");
