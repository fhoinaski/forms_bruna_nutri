# Analytics do site — arquitetura e decisões

Módulo first-party de analytics para o site público da Bruna Flores Nutri, integrado ao CRM. Este documento é a fonte de verdade sobre como o módulo funciona, o que ele coleta, o que **não** coleta, e suas limitações conhecidas.

## Arquitetura

```
Browser (site público)
  └─ components/analytics/SiteAnalyticsTracker.tsx   (montado 1x em app/layout.tsx)
       └─ lib/analytics/client-tracker.ts             (trackEvent/trackPageView — sendBeacon/fetch keepalive)
            └─ POST /api/public/analytics/events       (rate-limited, zod-validated, honeypot)
                 └─ lib/repositories/analytics.ts       (resolveOrCreateSession, insertAnalyticsEvents)
                      └─ D1: analytics_sessions, analytics_events

Backend (conversão real)
  app/api/public/pre-consultation/intake/complete/route.ts  ─┐
  app/api/form-submissions/route.ts                          ┴─ recordServerSideConversion()
       (só depois que o submit já teve sucesso real no banco)

Admin
  app/dashboard/analytics/page.tsx
       └─ GET /api/admin/analytics/summary (admin-only)
            └─ lib/repositories/analytics.ts (queries de leitura)

Assistente de IA (admin)
  lib/ai/agents/analytics/analytics-agent.ts → 5 tools read-only, profile ADMIN_ASSISTANT apenas
```

Nenhuma arquitetura paralela foi criada: reaproveita `d1Query`/`d1Execute`/`d1Batch` (`lib/d1/client.ts`), `consumeRateLimit` (`lib/security/rate-limit.ts`), `getSaoPauloDayBoundaries` (`lib/utils/timezone.ts`), o padrão de migrations (`db/*.sql`), o padrão de guarda admin (`getAdminFromRequest`), e o design system do dashboard (`DashboardPanel`, `DashboardKpiCard`, `EmptyState`/`LoadingState`).

## Schema (`db/20260818_0051_site_analytics.sql`)

- **`analytics_sessions`** — uma linha por sessão (janela de navegação). Guarda atribuição fixada no momento da criação (landing page, referrer, UTM, source_category), classificação de dispositivo, flags `is_bot`/`is_internal`, contadores (`pageview_count`, `event_count`, `converted`).
- **`analytics_events`** — uma linha por evento, vinculada a uma sessão. `UNIQUE(session_id, client_event_id)` garante idempotência.

Nenhuma tabela de agregação diária (`analytics_daily_aggregates`) foi criada nesta V1 — as queries do dashboard rodam direto sobre `analytics_events`/`analytics_sessions` com índices dedicados (`occurred_at`, `event_type`, `session_id`, `path`, `utm_source`, `utm_campaign`). Decisão: medir performance real antes de pré-agregar (ver seção Performance).

## Vocabulário de eventos (fechado, validado por zod)

`PAGE_VIEW`, `CTA_CLICK`, `WHATSAPP_CLICK`, `PRECONSULTATION_OPENED`, `PRECONSULTATION_STARTED`, `PRECONSULTATION_COMPLETED`, `BLOG_VIEW`, `SERVICE_VIEW`, `CONTACT_CLICK`, `PORTAL_LOGIN_OPENED`.

O cliente **nunca** pode enviar um `event_type` fora dessa lista (`lib/analytics/validation.ts`, zod `.enum()` + `.strict()`). Metadata por evento é filtrada por uma allowlist de chaves por tipo (`ALLOWED_METADATA_KEYS` em `lib/analytics/types.ts`) — qualquer chave fora da lista é descartada no servidor mesmo que passe no zod.

### Onde cada evento é disparado

| Evento | Local | Gatilho real |
|---|---|---|
| `PAGE_VIEW` | `SiteAnalyticsTracker` (global) | Toda navegação (`usePathname`/`useSearchParams`) |
| `WHATSAPP_CLICK` | Header (2×), Footer, Home hero | `onClick` no link `wa.me` real |
| `PRECONSULTATION_OPENED` | `app/formulario/page.tsx` | Mount da página |
| `PRECONSULTATION_STARTED` | `app/formulario/page.tsx` (form tradicional) / `PreConsultationDynamic.tsx` (fluxo com IA) | Primeiro campo obrigatório preenchido (progress > 0) / bootstrap da sessão de intake com sucesso |
| `PRECONSULTATION_COMPLETED` | `server-track.ts`, chamado de dentro de `intake/complete/route.ts` e `form-submissions/route.ts` | **Só depois** que o backend confirma sucesso real (`completeIntake`/`submitPreConsultation` sem lançar erro) — nunca no clique do botão |
| `BLOG_VIEW` | `app/blog/[slug]/page.tsx` via `TrackBlogView` | Mount da página do post |
| `PORTAL_LOGIN_OPENED` | `app/portal/page.tsx` | Mount da página (simplificação: dispara ao abrir a tela do portal, não distingue precisamente se o formulário de login está visível vs. paciente já autenticado) |
| `SERVICE_VIEW`, `CTA_CLICK`, `CONTACT_CLICK` | Vocabulário reservado | Não instrumentados nesta V1 (nenhum CTA adicional identificado na auditoria que justificasse o evento — evita inventar tracking sem ponto de disparo real) |

## Sessão

**Regra:** 30 minutos sem atividade = nova sessão (`SESSION_TIMEOUT_MS` em `lib/analytics/session.ts`).

- Cookie first-party `bruna_nutri_analytics_sid`: `httpOnly`, `secure` em produção, `sameSite=lax`, `path=/`, `maxAge=1800s` (sliding — reemitido a cada evento).
- O cookie guarda um token **cru** aleatório (`crypto.randomUUID()`). O banco nunca vê esse valor — só o HMAC-SHA256 dele (`hashSessionToken`, chave = `AUTH_SECRET`, mesmo pepper já usado por `lib/security/request.ts` para fingerprinting).
- Resolução (`resolveOrCreateSession`): sessão existente e dentro da janela → reutiliza (atualiza `last_seen_at`); sessão existente mas expirada → **rotaciona** para um token/hash novos (nunca reaproveita o hash, por causa do `UNIQUE(session_hash)`); nenhuma sessão encontrada → cria.
- O JS do navegador nunca lê o cookie (é `httpOnly`) — o session id interno nunca aparece na UI nem é exposto por nenhuma API.

## Atribuição (UTM/referrer)

Capturada **apenas na criação da sessão**, a partir do primeiro evento do lote. Navegação interna subsequente (`/servicos`, `/formulario`, etc.) nunca sobrescreve `utm_source`/`utm_medium`/`utm_campaign`/`utm_term`/`utm_content`/`source_category` da sessão — ficam fixos até a sessão expirar.

### Classificação de origem (determinística, `lib/analytics/classify.ts`)

Ordem: **UTM primeiro, depois referrer.** Nunca por IA/LLM.

1. Se há `utm_source`/`utm_medium`: mapeia por tokens conhecidos (`whatsapp`→whatsapp, `cpc/ppc/paid/ads`→paid, `email/newsletter`→email, `social`/redes conhecidas→social, `organic/search/seo`→organic_search, `referral`→referral; qualquer outra combinação→`other`, nunca inventa uma categoria não suportada pelos dados).
2. Sem UTM: usa o domínio do `document.referrer`. Motores de busca conhecidos → `organic_search`; redes sociais conhecidas → `social`; `wa.me`/`whatsapp.com` → `whatsapp`; qualquer outro domínio → `referral` (nunca vira `direct` só porque não reconhecemos o domínio).
3. Sem UTM e sem referrer → `direct`.

## Bot filtering

`lib/analytics/classify.ts#isBotUserAgent` — lista conservadora de padrões conhecidos (Googlebot, Bingbot, AhrefsBot, curl, wget, python-requests, HeadlessChrome, PhantomJS, Lighthouse, etc.) **mais** ausência de User-Agent (navegadores reais sempre enviam um). Eventos de bots continuam sendo **gravados** (`is_bot=1`), nunca descartados — só excluídos dos KPIs padrão (`HUMAN_SESSION_FILTER`/`HUMAN_EVENT_FILTER` = `is_bot=0 AND is_internal=0` nas queries do dashboard).

## Tráfego interno

`lib/analytics/internal-traffic.ts#isInternalRequest`, marca `is_internal=1` (não filtra a captura, só exclui dos KPIs) quando:
- Cookie de sessão admin (`bruna_nutri_admin_session`) presente — admin navegando o próprio site.
- Header `x-analytics-internal` bate com a env var `ANALYTICS_E2E_INTERNAL_TOKEN` (só definida em ambiente de E2E/teste — nunca em produção; fail-closed se a env var não existir).
- User-Agent de automação conhecida (Playwright, Puppeteer).

**Decisão explícita:** pacientes autenticados no portal (`bruna_nutri_client_portal_session`) **não** são tratados como tráfego interno — são visitantes reais para fins de analytics.

## Deduplicação / idempotência

`UNIQUE(session_id, client_event_id)` em `analytics_events` + `INSERT OR IGNORE`. O cliente gera um `client_event_id` (UUID v4) por evento; retries de rede, duplo submit, e o duplo-mount do React Strict Mode (guardado adicionalmente por `useRef` no tracker) resultam no máximo em 1 linha efetiva. `insertAnalyticsEvents` só incrementa os contadores da sessão para as linhas que **realmente** foram inseridas (`meta.changes === 1`), nunca para duplicatas ignoradas — testado explicitamente em `tests/analytics-repository.test.ts`.

## Conversões e funil

Única conversão "principal": `PRECONSULTATION_COMPLETED`. Funil (`getConversionFunnel`): Visitantes → Visitaram serviços (`PAGE_VIEW /servicos`) → Abriram pré-consulta (`PRECONSULTATION_OPENED`) → Iniciaram (`PRECONSULTATION_STARTED`) → Concluíram (`PRECONSULTATION_COMPLETED`), cada estágio contado por `COUNT(DISTINCT session_id)`.

## Dashboard (`/dashboard/analytics`)

Admin-only (`getAdminFromRequest`, mesmo padrão de todo `/api/admin/*`). Filtros de período: Hoje / 7 dias / 30 dias / 90 dias (fuso America/Sao_Paulo via `lib/utils/timezone.ts`, mesma utilidade do resto do dashboard). KPIs (visitantes/sessões/pageviews/conversões/taxa), gráfico de sessões por dia, donut de origem, funil, diagnóstico de tracking, campanhas UTM, páginas mais visitadas (com entradas/saídas), landing pages, desempenho de posts do blog.

## Integração com o assistente de IA

`lib/ai/agents/analytics/analytics-agent.ts` — 5 tools **read-only**, registradas com `profiles: ["ADMIN_ASSISTANT"]` (nunca `PATIENT_ASSISTANT`), `risk: "read"`, `dataSensitivity: "safe"`: `getSiteAnalyticsOverview`, `getTopTrafficSources`, `getTopPages`, `getConversionFunnel`, `getCampaignPerformance`. Todas chamam as **mesmas** funções de `lib/repositories/analytics.ts` usadas pelo dashboard — a IA nunca recalcula nem estima um número, só lê e narra. Testado explicitamente em `tests/analytics-patient-assistant-exclusion.test.ts` que nenhuma tool de analytics é visível para o perfil `PATIENT_ASSISTANT`.

## Fail-open

`POST /api/public/analytics/events`: rate limit e validação de payload retornam erro real (429/400) — são respostas deliberadas, não falhas de sistema. Qualquer falha **depois** disso (D1 fora do ar, erro inesperado) é capturada e a rota ainda responde 202, porque o tracker no navegador também falha em silêncio (`sendBeacon`/`fetch` com `.catch(() => {})`, nunca propaga exceção). O mesmo vale para `recordServerSideConversion`: se o registro do evento de conversão falhar, o erro é logado e engolido — o fluxo real de submissão da pré-consulta nunca é bloqueado por causa de analytics.

## Retenção

**Decisão documentada:** eventos e sessões detalhados ficam retidos por 12 meses; não há hoje um job automático de purga (não implementado nesta V1 — a tabela é pequena o suficiente para não ser urgente, e criar um cron de purga sem necessidade medida contraria a diretriz de "não construir agregação/infra antecipada sem medir"). Isso deve ser revisto quando o volume justificar.

## Exclusão de dados

Como o analytics é pseudônimo por padrão (sem nome/e-mail/telefone em nenhuma linha), não há um fluxo de "excluir os dados do visitante X" — não é possível re-identificar uma sessão a partir de um pedido LGPD sem informação adicional. Se, no futuro, alguma sessão de analytics vier a ser **deliberadamente** vinculada a um paciente conhecido (fora do escopo desta V1 — não implementado), esse vínculo passaria a exigir o mesmo fluxo de exclusão/portabilidade já usado para dados clínicos.

## Limitações conhecidas (visíveis para o admin, não escondidas)

- `document.referrer` pode ser removido pelo navegador (política de referrer) ou por extensões de privacidade.
- Bloqueadores de anúncio podem impedir o `POST` de analytics de sair do navegador — parte do tráfego real não é capturada.
- O visitante pode limpar cookies a qualquer momento, criando uma "nova" sessão pseudônima para a mesma pessoa.
- "Visitantes únicos" é uma aproximação por sessão — não há identificador de longo prazo entre sessões/dispositivos, então a mesma pessoa em duas visitas (ou em dois dispositivos) conta como dois "visitantes".
- Classificação de dispositivo/navegador/SO é aproximada via User-Agent, não uma detecção de capacidade real.
- Conversão cross-device (ex.: viu o Instagram no celular, preencheu a pré-consulta no notebook) não é identificável de forma anônima — cada sessão é isolada por design.
- `PORTAL_LOGIN_OPENED` dispara ao montar a tela do portal, não especificamente quando o formulário de login está visível (simplificação documentada acima).

## O que NÃO foi implementado nesta fase (por decisão explícita)

Google Analytics, Meta Pixel, fingerprinting, heatmap, session replay, gravação de tela, rastreamento de teclas, tracking clínico, vínculo automático visitante→paciente, ad targeting, remarketing — nenhum desses.

Também fora do escopo desta V1, com justificativa:
- **Export CSV dos agregados** — não implementado; os dados já são visíveis nas tabelas do dashboard e a prioridade foi o pipeline de captura/atribuição/dashboard funcionando ponta a ponta primeiro.
- **`analytics_daily_aggregates`** — não criada; ver seção Performance.
- **Teste de carga com 100k eventos sintéticos** — não executado nesta rodada; os índices foram desenhados para as consultas reais (`occurred_at`, `event_type`, `session_id`, `path`, `utm_source`, `utm_campaign`) seguindo o mesmo raciocínio do resto do schema, mas a validação de performance sob volume alto fica como próximo passo antes de um lançamento com tráfego pago intenso.
- **User journey / grafo de sequência completo** — o backend expõe entradas/saídas por página (suficiente para responder "por onde entram" e "por onde saem"), mas não um grafo de caminhos completos (`/ → /servicos → /formulario`) — journey agregado fica para uma iteração futura caso a necessidade seja confirmada.

## Performance

Índices criados para as colunas realmente usadas nos filtros/agrupamentos das queries do dashboard (`occurred_at`, `event_type`, `session_id`, `path`, `utm_source`, `utm_campaign`, `is_bot`/`is_internal` compostos). Nenhuma agregação prematura foi construída — a decisão foi medir com dados reais antes de adicionar uma camada de rollup diário, seguindo a diretriz do pedido original.
