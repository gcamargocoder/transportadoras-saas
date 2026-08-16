// Mensagens de erro padronizadas do enforcement de plano (Fase 48).
// Mesmo padrao de AUTH_ERRORS (apps/api/src/auth/constants/auth-error.constants.ts):
// centralizadas aqui para evitar strings duplicadas espalhadas por guard/
// service, e para os testes assercionarem contra a mesma constante usada em
// producao. Sem campo "code" separado no envelope de erro -- o projeto ja
// diferencia erros por mensagem (AllExceptionsFilter so expoe
// error=nome da exception + message=texto), este enforcement segue a mesma
// convencao.
export const PLAN_ERRORS = {
  MODULE_DISABLED: 'Este modulo nao esta habilitado no plano desta empresa.',
  USER_LIMIT_REACHED: 'Limite de usuarios do plano atingido.',
  VEHICLE_LIMIT_REACHED: 'Limite de veiculos do plano atingido.',
  DRIVER_LIMIT_REACHED: 'Limite de motoristas do plano atingido.',
  STORAGE_LIMIT_REACHED: 'Limite de armazenamento do plano atingido.',
} as const;
