# Auth

Modulo de autenticacao e autorizacao da plataforma: login, refresh/rotacao de
sessao, logout, guards e decorators de autorizacao. Nenhuma regra de negocio
da transportadora (tenants, motoristas, veiculos, viagens...) vive aqui.

## Estrutura

```
auth/
├── auth.module.ts        # registra guards globais (JwtAuthGuard, RolesGuard)
├── controllers/            # AuthController: /auth/login, /refresh, /logout, /me
├── services/                # AuthService: login, refreshTokens, logout
├── strategies/               # JwtAccessStrategy (Passport, valida access token)
├── guards/                    # JwtAuthGuard (global), RolesGuard (global)
├── decorators/                  # @Public(), @Roles(...), @CurrentUser()
├── dto/                           # LoginDto, RefreshTokenDto, AuthTokensDto
├── interfaces/                     # JwtPayload, RefreshTokenPayload, AuthenticatedRequest
├── entities/                         # AuthenticatedUser (resposta segura, sem passwordHash)
├── constants/                          # chaves de metadata + mensagens de erro
├── types/                                # TokenPair
└── utils/                                  # hash de senha (argon2), hash de token,
                                             # parser de duracao, mapeadores
```

## Fluxo

1. **Login** (`POST /auth/login`, publico): valida e-mail/senha (Argon2id) e
   `isActive`, emite access token (JWT curto) + refresh token (JWT longo,
   persistido em `refresh_tokens` com hash SHA-256, nunca em texto puro).
2. **Refresh** (`POST /auth/refresh`, publico): verifica o refresh token,
   confirma que a sessao ainda existe e nao foi revogada/expirada, **revoga o
   token usado e emite um par novo** (rotacao -- reuso do token antigo apos
   isso e bloqueado).
3. **Logout** (`POST /auth/logout`, autenticado): revoga o refresh token
   informado. Idempotente.
4. **Rotas protegidas**: `JwtAuthGuard` e global (`APP_GUARD`) -- toda rota
   exige access token valido por padrao. `@Public()` e a unica forma de
   isentar uma rota (usado em login/refresh e no health check).

## Seguranca

- Senha de usuario: **Argon2id** (nunca texto puro), parametros minimos OWASP.
- Refresh token: JWT assinado com segredo PRÓPRIO (diferente do access
  token) + hash SHA-256 armazenado para permitir revogacao/rotacao (um JWT
  sozinho nao pode ser invalidado antes de expirar).
- Mensagens de erro de login propositalmente genericas para e-mail
  inexistente vs. senha errada (evita enumeracao de contas -- OWASP).
- Segredos via `ConfigModule`/`.env`, nunca hardcoded; estrutura pronta para
  rotacao futura (ver comentario em `config/configuration.ts`).

## Limitacoes conhecidas (fora do escopo desta fase)

- Login busca usuario por e-mail via `findFirst`, assumindo unicidade na
  pratica -- o schema so garante `@@unique([tenantId, email])` (unico por
  empresa, nao globalmente). A fase de Multi-tenant deve decidir entre
  e-mail globalmente unico ou seletor de empresa no login.
- "Usuario bloqueado" tem mensagem/estrutura de erro pronta
  (`AUTH_ERRORS.USER_BLOCKED`) mas nao esta conectada a nenhum campo do
  schema ainda (so existe `isActive`).
