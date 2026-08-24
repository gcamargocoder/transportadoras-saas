-- Fase 80 -- Conciliacao Financeira e Importacao de Movimentacoes Bancarias.
-- Migration ADITIVA: cria apenas o enum e a tabela de movimentacoes
-- bancarias importadas (financial_bank_transactions). Nenhuma tabela
-- financeira existente e alterada -- FinancialTransaction continua sendo o
-- unico ledger oficial.

-- CreateEnum
CREATE TYPE "financial_bank_transaction_status" AS ENUM ('PENDING', 'MATCHED', 'DIVERGENT');

-- CreateTable
CREATE TABLE "financial_bank_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "financial_transaction_type" NOT NULL,
    "external_id" TEXT,
    "row_hash" TEXT,
    "status" "financial_bank_transaction_status" NOT NULL DEFAULT 'PENDING',
    "financial_transaction_id" UUID,
    "metadata" JSONB,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_bank_transactions_financial_transaction_id_key" ON "financial_bank_transactions"("financial_transaction_id");

-- CreateIndex (NULL em external_id nunca colide -- comportamento padrao de unique index no Postgres)
CREATE UNIQUE INDEX "financial_bank_transactions_tenant_id_financial_account_id_external_id_key" ON "financial_bank_transactions"("tenant_id", "financial_account_id", "external_id");

-- CreateIndex
CREATE INDEX "financial_bank_transactions_tenant_id_idx" ON "financial_bank_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_bank_transactions_tenant_id_financial_account_id_idx" ON "financial_bank_transactions"("tenant_id", "financial_account_id");

-- CreateIndex
CREATE INDEX "financial_bank_transactions_tenant_id_status_idx" ON "financial_bank_transactions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "financial_bank_transactions_financial_account_id_date_idx" ON "financial_bank_transactions"("financial_account_id", "date");

-- AddForeignKey
ALTER TABLE "financial_bank_transactions" ADD CONSTRAINT "financial_bank_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_bank_transactions" ADD CONSTRAINT "financial_bank_transactions_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_bank_transactions" ADD CONSTRAINT "financial_bank_transactions_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
