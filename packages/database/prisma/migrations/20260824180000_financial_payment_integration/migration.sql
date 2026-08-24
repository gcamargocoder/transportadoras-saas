-- Fase 79 -- Integracao de Recebimentos e Pagamentos com Contas Financeiras.
-- Migration ADITIVA: adiciona 2 colunas nullable + FK em receivable_payments
-- e em payable_payments. Nenhuma coluna existente e alterada, nenhuma linha
-- historica e tocada (financial_account_id/financial_transaction_id ficam
-- NULL para pagamentos registrados antes desta fase).

-- AlterTable
ALTER TABLE "receivable_payments"
  ADD COLUMN "financial_account_id" UUID,
  ADD COLUMN "financial_transaction_id" UUID;

-- AlterTable
ALTER TABLE "payable_payments"
  ADD COLUMN "financial_account_id" UUID,
  ADD COLUMN "financial_transaction_id" UUID;

-- CreateIndex (unicidade: no maximo 1 payment aponta para uma dada transaction)
CREATE UNIQUE INDEX "receivable_payments_financial_transaction_id_key" ON "receivable_payments"("financial_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payable_payments_financial_transaction_id_key" ON "payable_payments"("financial_transaction_id");

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
