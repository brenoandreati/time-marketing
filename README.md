# Converso

Plataforma SaaS de automação de conversas para Instagram, multiempresa, usando apenas a API oficial da Meta.

Arquitetura, módulos e plano por fases: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

**Estado atual:** Fase 1 (fundação) concluída e validada.

## Estrutura

```
apps/api   NestJS — API REST, webhooks da Meta e worker (BullMQ)
apps/web   Next.js — interface
docs/      Arquitetura e plano técnico
```

## Rodando localmente

Requisitos: Node 22+, pnpm 10, PostgreSQL 16 e Redis 7 (ou `docker compose up -d`).

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Gere a chave de criptografia e coloque em `ENCRYPTION_KEY` no `apps/api/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
pnpm db:migrate
```

Em três terminais:

```bash
pnpm dev:api
```

```bash
pnpm dev:worker
```

```bash
pnpm dev:web
```

Acesse http://localhost:3000, crie uma conta e uma empresa. Para conectar o Instagram, configure o app da Meta (seção 8 da arquitetura).

Para tornar um usuário administrador da plataforma:

```bash
pnpm db:seed -- --admin=email@exemplo.com
```

## Testes

Usam o banco `converso_test` e o índice 15 do Redis:

```bash
createdb converso_test
```

```bash
pnpm --filter @converso/api test
```
