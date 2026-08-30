-- Fiscal/XML: vinculo opcional 1:1 entre FiscalDocument e um titulo
-- (Payable/Receivable) gerado manualmente a partir dele (autopreenchimento
-- no formulario de criacao manual ja existente -- Fase Financeiro CP/CR).
-- Aditivo: colunas novas nullable, sem perda de dados.

-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "fiscal_document_id" UUID;

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "fiscal_document_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "payables_fiscal_document_id_key" ON "payables"("fiscal_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_fiscal_document_id_key" ON "receivables"("fiscal_document_id");

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
