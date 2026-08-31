-- Correcao de bug real encontrado durante a auditoria de regressao da Fase
-- "Alertas de sincronizacao" (nao relacionado a ela): o valor de enum
-- CHECKLIST_CRITICAL_NON_CONFORMITY foi adicionado ao schema.prisma na
-- Fase 111, mas a migration correspondente (ALTER TYPE ... ADD VALUE)
-- nunca foi criada -- confirmado por busca em todas as migrations
-- existentes. Efeito real: toda vez que NotificationsService.processTenant
-- gerava um candidato desse tipo no MESMO lote de outros tipos,
-- notification.createMany() inteiro falhava (INSERT em lote e atomico --
-- 1 linha com enum invalido rejeita o lote inteiro), derrubando TAMBEM as
-- notificacoes validas daquele tenant naquele ciclo, silenciosamente
-- (capturado pelo try/catch de processAllTenants, nunca propagado).
-- Migration isolada de proposito (mesmo motivo das demais: Postgres exige
-- que um novo valor de enum seja commitado antes de poder ser usado em
-- INSERT/WHERE).

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'CHECKLIST_CRITICAL_NON_CONFORMITY';
