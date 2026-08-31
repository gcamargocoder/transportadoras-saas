-- Atualizacao automatica de Pedagios: garante, no proprio banco (nunca so
-- na aplicacao, que pode rodar em mais de 1 instancia), que nunca exista
-- mais de 1 execucao RUNNING simultanea para o mesmo provider -- protege
-- contra o scheduler diario colidir com um disparo manual (POST
-- /toll-data/sync) e contra multiplas instancias da API disparando o
-- mesmo cron ao mesmo tempo. Indice parcial (so cobre linhas com
-- status='RUNNING'): nao restringe linhas ja finalizadas (SUCCESS/PARTIAL/
-- FAILED podem se repetir por provider normalmente, sao o historico).
-- Nao requer nenhuma coluna nova nem mudanca no schema.prisma -- Prisma
-- mapeia qualquer violacao de unicidade do Postgres para
-- PrismaClientKnownRequestError(code: 'P2002') automaticamente, mesmo sem
-- o indice estar declarado no schema.

CREATE UNIQUE INDEX "toll_data_sync_runs_one_running_per_provider"
ON "toll_data_sync_runs" ("provider")
WHERE "status" = 'RUNNING';
