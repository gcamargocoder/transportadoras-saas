-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_opportunities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "quotation_id" UUID,
    "proposal_id" UUID,
    "stage_id" UUID NOT NULL,
    "title" TEXT,
    "estimated_value" DECIMAL(10,2),
    "notes" TEXT,
    "lost_reason" TEXT,
    "won_at" TIMESTAMP(3),
    "lost_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_stages_tenant_id_idx" ON "pipeline_stages"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_tenant_id_order_key" ON "pipeline_stages"("tenant_id", "order");

-- CreateIndex
CREATE INDEX "pipeline_opportunities_tenant_id_idx" ON "pipeline_opportunities"("tenant_id");

-- CreateIndex
CREATE INDEX "pipeline_opportunities_tenant_id_customer_id_idx" ON "pipeline_opportunities"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "pipeline_opportunities_tenant_id_stage_id_idx" ON "pipeline_opportunities"("tenant_id", "stage_id");

-- CreateIndex
CREATE INDEX "pipeline_opportunities_tenant_id_quotation_id_idx" ON "pipeline_opportunities"("tenant_id", "quotation_id");

-- CreateIndex
CREATE INDEX "pipeline_opportunities_tenant_id_proposal_id_idx" ON "pipeline_opportunities"("tenant_id", "proposal_id");

-- CreateIndex
CREATE INDEX "pipeline_opportunities_tenant_id_created_at_idx" ON "pipeline_opportunities"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
