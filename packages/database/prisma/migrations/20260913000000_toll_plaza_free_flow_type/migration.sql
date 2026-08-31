-- Free Flow / Porticos de Pedagio: distingue praca fisica de portico de
-- cobranca eletronica sem parada (Resolucao ANTT 6.079/2026), reaproveitando
-- o modelo TollPlaza existente (nunca uma tabela paralela). Aditivo: coluna
-- nova com DEFAULT, todo registro existente vira 'PHYSICAL_PLAZA' sem
-- nenhuma perda/alteracao de dado.

-- CreateEnum
CREATE TYPE "toll_plaza_type" AS ENUM ('PHYSICAL_PLAZA', 'FREE_FLOW_GANTRY');

-- AlterTable
ALTER TABLE "toll_plazas" ADD COLUMN     "type" "toll_plaza_type" NOT NULL DEFAULT 'PHYSICAL_PLAZA';
