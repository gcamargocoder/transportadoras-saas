# apps/admin-web — Painel Administrativo (Next.js)

Painel operacional multi-tenant, acessivel de computador, tablet e celular via navegador
(responsivo). Nenhuma tela de negocio foi criada nesta etapa.

## Estado atual (fundacao)
- App Router configurado (`src/app`)
- Tailwind CSS configurado, sem design system de negocio ainda
- Layout raiz minimo, pagina inicial vazia (placeholder)

## Stack
Next.js (App Router) · React · TypeScript · Tailwind CSS

## Rodando localmente
```bash
cp .env.example .env.local
pnpm --filter @transportadoras/admin-web dev
```
