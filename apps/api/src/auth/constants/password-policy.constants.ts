// Fase 46 -- ate aqui so existia @MinLength(8), sem nenhuma exigencia de
// complexidade. Regra minima (letra + numero, mantendo o minimo de 8 ja
// existente) aplicada SOMENTE em criacao/redefinicao de senha
// (CreateUserDto, UpdateUserDto quando password e informado,
// CreateTenantAdminDto) -- NUNCA em LoginDto, que so compara a senha
// informada contra o hash ja salvo: adicionar essa regex la rejeitaria o
// login de contas existentes cuja senha antiga nao atenda ao padrao novo.
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const PASSWORD_COMPLEXITY_MESSAGE = 'A senha deve conter pelo menos uma letra e um numero.';
