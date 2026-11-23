# Converso — Arquitetura e plano técnico

Plataforma SaaS multiempresa de automação de conversas para Instagram (com o motor preparado para outros canais).
Este documento descreve a arquitetura, os módulos, as dependências entre eles e a ordem de desenvolvimento por fases.

## 1. Visão geral

```
                    ┌──────────────────────────┐
  Navegador ──────▶ │  apps/web  (Next.js 15)  │  /api/* → proxy para a API (cookie de sessão first-party)
                    └────────────┬─────────────┘
                                 │
  Meta (OAuth) ────────────────▶ │
  Meta (webhooks) ─────────────▶ ▼
                    ┌──────────────────────────┐        ┌───────────────┐
                    │ apps/api — processo HTTP │──────▶ │  PostgreSQL   │
                    │ (NestJS, REST, webhooks) │        └───────────────┘
                    └────────────┬─────────────┘                ▲
                                 │ BullMQ (Redis)               │
                    ┌────────────▼─────────────┐                │
                    │ apps/api — processo      │────────────────┘
                    │ worker (filas, rotinas)  │──────▶ Graph API do Instagram
                    └──────────────────────────┘
```

* **API e worker são o mesmo código com dois pontos de entrada** (`src/main.ts` e `src/worker.ts`), escalados de forma independente.
* O webhook só **valida, persiste e enfileira**; todo o processamento acontece no worker. Responder rápido evita reenvios da Meta.
* O frontend nunca recebe tokens da Meta nem chaves: só o cookie de sessão `httpOnly`.

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind 4, SWR, Recharts | Pedido no escopo; React Flow (`@xyflow/react`) entra na Fase 2 |
| Backend | NestJS 11 (Express), TypeScript | Módulos, injeção de dependência e guards por rota |
| Banco | PostgreSQL 16 + Drizzle ORM (migrações SQL versionadas em `apps/api/drizzle`) | SQL explícito, sem binários externos; compatível com Supabase (é Postgres) |
| Filas | Redis + BullMQ | Retentativas com backoff, jobs agendados, deduplicação por `jobId` |
| Autenticação | Própria: argon2id + sessão opaca (hash SHA-256 no banco) em cookie `httpOnly` | Revogável, sem dependência externa; Supabase Auth pode substituir depois sem mudar os guards |
| Criptografia | AES-256-GCM para tokens em repouso | Chave `ENCRYPTION_KEY` fora do banco |
| Testes | Vitest + Supertest contra Postgres e Redis reais | Testes de integração exercitam SQL de verdade |

## 3. Módulos do backend (`apps/api/src/modules`)

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `auth` | Cadastro, login, logout, sessão (guard global `SessionGuard`) | activity |
| `workspaces` | Empresas, membros, matriz de permissões, `WorkspaceGuard` (isolamento) | activity |
| `activity` | Registro de atividades/auditoria (feed do painel) | — |
| `instagram` | Cliente da Graph API (OAuth, tokens, perfil, assinatura de webhooks) e disponibilidade da integração | config |
| `channels` | Contas conectadas: fluxo OAuth, status, renovação, desconexão, limites do plano | instagram, workspaces |
| `webhooks` | Endpoint da Meta: verificação, assinatura `X-Hub-Signature-256`, normalização, deduplicação, enfileiramento | queue |
| `queue` | Definição das filas (produtor) | Redis |
| `inbound` | Worker: processa eventos (contato, conversa, mensagem), renova tokens, reenfileira eventos parados | channels |
| `dashboard` | Indicadores e séries diárias no fuso da empresa | — |
| `health` | Verificação de banco e Redis | — |

Módulos previstos para as próximas fases: `automations`, `flows` (versões), `engine` (execução), `triggers`, `messaging` (envio), `inbox`, `contacts`, `tags`, `custom-fields`, `sequences`, `ai`, `knowledge-base`, `integrations` (webhooks de saída), `analytics`, `admin`, `billing/plans`.

### Canais
`channel` é um enum no banco e as tabelas de contato, conversa e mensagem são independentes de canal. Um novo canal (WhatsApp, Messenger, Telegram) adiciona: um cliente de API, um parser de webhook e um adaptador de envio. O motor de automações (Fase 2) consumirá eventos normalizados, não payloads da Meta.

## 4. Multiempresa e segurança

* Toda tabela de dados de empresa tem `workspace_id`. Toda rota de empresa tem `:workspaceId` e passa pelo `WorkspaceGuard`, que confere a associação do usuário e a permissão exigida (`@RequirePermission`). Não-membros recebem **404** (não revela a existência da empresa). Empresa bloqueada recebe 403.
* Permissões por função em `workspaces/permissions.ts` (Administrador, Gerente, Atendente, Analista, Visualizador); a lista de permissões vai para o frontend, que esconde ações não permitidas — mas a autorização é sempre do backend.
* CSRF: cookie `SameSite=Lax` + verificação de `Origin` em requisições que alteram estado.
* Rate limiting global (300/min) e mais restrito em login (10/min) e cadastro (5/min).
* Tokens da Meta criptografados (AES-256-GCM); a API nunca os devolve. Ao desconectar, o token é apagado.
* OAuth com `state` aleatório de uso único (hash no banco, expira em 10 min) amarrado ao usuário que iniciou.
* Webhooks: HMAC-SHA256 do corpo bruto com o App Secret, comparação em tempo constante.
* Fase 6: Row Level Security no Postgres como segunda barreira, retenção de dados, exportação/exclusão (LGPD).

## 5. Pipeline de eventos do Instagram

1. `POST /webhooks/instagram` valida a assinatura e normaliza cada item (`message`, `message_echo`, `comment`, `reaction`, `read`, `postback`…) com uma **chave de deduplicação** estável (ex.: `message:<mid>`, `comment:<id>`).
2. Insere em `webhook_events` com `ON CONFLICT DO NOTHING` (reenvios da Meta são descartados aqui) e enfileira com `jobId = evt-<id>`.
3. O worker reivindica o evento atomicamente (`received → processing`), processa em transação (upserts idempotentes de contato e conversa; mensagem única por `(workspace, mid)`) e marca `processed`/`ignored`.
4. Falha: volta para `received` e o BullMQ tenta de novo (6 tentativas, backoff exponencial). Na última, vira `failed` e aparece no feed do painel como erro.
5. Se o Redis estiver fora no recebimento, o evento fica salvo e a rotina de manutenção (a cada minuto) reenfileira. Eventos presos em `processing` por queda do worker também voltam.
6. Eventos de contas não conectadas são guardados como `ignored` (auditoria), sem processamento.

Uma falha de uma empresa não bloqueia as outras: cada evento é um job independente, com concorrência de 20 por worker.

## 6. Modelo de dados (Fase 1)

`users`, `sessions`, `plans` (limites em JSON, configuráveis), `workspaces`, `workspace_members`, `channel_accounts`, `oauth_states`, `webhook_events`, `contacts`, `conversations`, `messages`, `automations` (cadastro mínimo para o indicador “automações ativas”), `activity_logs`.

Planos iniciais: Gratuito (1 conta), Profissional (3), Empresarial (20) — criados pela migração, nunca sobrescritos depois.

## 7. Plano por fases

Cada fase só começa depois que a anterior passa nos testes automatizados e na validação manual.

### Fase 1 — Fundação ✅ (esta entrega)
Estrutura do monorepo, banco e migrações, autenticação, multiempresa e permissões, painel com indicadores reais e filtros de período, Contas Conectadas (OAuth oficial, tokens criptografados, renovação automática, verificação de status, desconexão, limite do plano), recebimento de webhooks com assinatura, deduplicação e processamento assíncrono, registro de atividades.

**Validação:** 50 testes automatizados (unidade + integração com Postgres e Redis reais) e teste ponta a ponta API → Redis → worker → banco. Fluxo do navegador verificado (cadastro, criação de empresa, painel, contas, configurações, mobile).

**Pendente de recurso externo:** a conexão real com o Instagram exige um app na Meta (ver §8). Sem as credenciais, a interface mostra o que falta e não simula nada.

### Fase 2 — Automação
1. `flows` + `flow_versions` (JSON do grafo, imutável ao publicar) e `automations` completo (gatilho, status Rascunho/Ativa/Pausada/Com erro/Arquivada, versão publicada).
2. `triggers`: palavra-chave (exata, contém, palavra completa, começa com, lista, ignorar maiúsculas), comentário (post/Reel específico, palavras excluídas, respostas públicas alternadas), resposta/menção em story, fallback; prioridade entre automações.
3. `messaging`: envio pela API oficial (`POST /me/messages`, resposta privada a comentário, resposta pública), controle da janela de 24h e da tag `HUMAN_AGENT`, limites de taxa por conta.
4. `engine`: execuções persistidas (id, empresa, automação, versão, contato, etapa atual, estado, variáveis, histórico), retomada, atrasos via jobs agendados, idempotência por passo, concorrência por contato.
5. Flow Builder (React Flow): blocos, painel de propriedades, autosave, minimapa, validação, publicação.
6. Simulador que executa o mesmo motor com um adaptador de envio “em memória”.

### Fase 3 — Atendimento
Inbox (três colunas, status, atribuição, notas internas, pausa de automações por conversa com trava contra respostas simultâneas), CRM de contatos, tags, campos personalizados tipados, segmentos, exportação, convites e gestão de equipe.

### Fase 4 — Inteligência
Bloco de IA no fluxo e modo de atendimento inteligente com provedor configurável, base de conhecimento por empresa, regras de “não inventar” (respostas ancoradas na base, encaminhamento humano quando não souber), sequências com elegibilidade, consentimento e opt-out.

### Fase 5 — Gestão
Analytics por automação/conta/período/origem (separando métricas confirmadas pela Meta de estimadas), central de integrações (webhooks de entrada e saída com retentativas e histórico), painel do administrador da plataforma, gestão de planos e limites, consumo.

### Fase 6 — Escala
RLS, retenção e LGPD (exportação/exclusão), observabilidade (logs estruturados, métricas das filas, alertas), testes de carga do webhook e do motor, documentação da API.

## 8. Configurando a Meta (necessário para o requisito “conectar uma conta real”)

1. Em developers.facebook.com, crie um app do tipo *Business* e adicione o produto **Instagram** → *API com Login do Instagram*.
2. Em *Configurações de login*, cadastre a URL de redirecionamento: `API_PUBLIC_URL/integrations/instagram/callback` (a tela Contas Conectadas mostra a URL exata).
3. Em *Webhooks*, cadastre `API_PUBLIC_URL/webhooks/instagram` com o mesmo `META_WEBHOOK_VERIFY_TOKEN` do servidor e assine os campos `messages`, `messaging_postbacks`, `messaging_seen`, `message_reactions` e `comments`.
4. Preencha `META_APP_ID` (ID do app do Instagram), `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` em `apps/api/.env`.
5. A URL pública precisa de HTTPS (em desenvolvimento, use um túnel). Em produção, recomenda-se `API_PUBLIC_URL=https://seu-dominio/api`, passando pelo proxy do Next.js.
6. Enquanto o app não passar no **App Review** com **Advanced Access** para `instagram_business_basic`, `instagram_business_manage_messages` e `instagram_business_manage_comments`, só contas com função no app podem ser conectadas.
