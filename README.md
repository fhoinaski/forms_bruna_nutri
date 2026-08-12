# Bruna Flores Nutri

Sistema de atendimento nutricional: pré-consulta pública (formulário + guiada
por IA), CRM de pacientes, prontuário, agenda, antropometria, planos
alimentares, protocolos, portal do paciente, módulo LGPD, MFA e uma
arquitetura de IA com múltiplos agentes.

**Stack:** Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 + Zod 4 +
Cloudflare D1 + AI SDK (OpenAI/Anthropic/Google/DeepSeek/xAI/Groq/Mistral) +
Vitest + Playwright.

---

## Arquitetura

```
Navegador → Vercel / Next.js (App Router) → Cloudflare D1 HTTP API
                          └───────────────→ provedores de IA (AI SDK)
```

- **Frontend e APIs:** Next.js App Router (roteamento e API handlers)
- **Banco de dados:** Cloudflare D1 (migrations versionadas em `db/`)
- **Autenticação:** bcryptjs + JWT (`jose`), cookie httpOnly (8h), MFA TOTP
- **Rail de IA:** `lib/ai/core` (orquestradores), `lib/ai/agents` (perfis),
  `lib/ai/gateway` (porta única com timeout/validação Zod), `lib/ai/policies`,
  `lib/ai/privacy`, `lib/ai/tools` (tool registry), `lib/ai/memory`.
- **Sessão pública de pré-consulta guiada:** JWT dedicado (`PATIENT_INTAKE_SESSION_SECRET`)
  + estado estruturado em D1 (`patient_intake_sessions`, criptografado AES-256-GCM).

---

## Pré-requisitos

- Node.js 20+
- Conta Cloudflare com acesso D1 e token de API (D1 Edit)
- Conta Vercel (deploy) — opcional para desenvolvimento local
- `AUTH_SECRET`, `PATIENT_INTAKE_SESSION_SECRET` e chaves de cifragem (ver §Variáveis)

---

## 1. Aplicar migrations no D1

```bash
npm run migrate:d1:check   # valida os arquivos (sem aplicar)
npm run migrate:d1         # aplica incrementalmente
npm run migrate:d1:status  # confere checksum e pendências
```

As migrations numeradas em `db/` são a única fonte do schema. Não há DDL no
runtime (o CI valida com `schema:runtime-check`). Detalhes em `db/README.md`.

---

## 2. Variáveis de ambiente

Copie `env.example` → `.env.local` e preencha. Nenhuma variável sensível pode
ter prefixo `NEXT_PUBLIC_`.

| Variável | Descrição |
|----------|-----------|
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_D1_API_TOKEN` | Acesso ao D1 |
| `AUTH_SECRET` | Assina JWT de sessão administrativa (mín. 32 chars) |
| `PATIENT_INTAKE_SESSION_SECRET` | Segredo **dedicado** da sessão pública de intake (≥32 bytes; obrigatório em produção) |
| `MFA_ENCRYPTION_KEY` | Cifragem de segredos MFA |
| `CLINICAL_DATA_ENCRYPTION_KEY` | Cifragem de prontuário/evoluções/respostas |
| `BACKUP_ENCRYPTION_KEY` | Cifragem de backups |
| `RESEND_API_KEY` / `EMAIL_FROM` | Envio de e-mail |
| `CRON_SECRET` | Protege os endpoints de cron |
| `BLOG_AGENT_TOKEN` | Token dedicado ao agente de blog |
| `NEXT_PUBLIC_BASE_URL` | URL pública (canonical) |

Gerar segredos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 3. Criar admin inicial

```env
ADMIN_EMAIL=admin@brunafloresnutri.com
ADMIN_PASSWORD=coloque_uma_senha_forte
AUTH_SECRET=...
```

```bash
node scripts/create-admin.mjs
```

O primeiro acesso exige troca de senha (e MFA pode ser habilitado em
Configurações → Segurança).

---

## 4. Rodar localmente

```bash
npm install
npm run dev
```

- Pré-consulta pública: http://localhost:3000/formulario
- Login admin: http://localhost:3000/login
- Dashboard: http://localhost:3000/dashboard
- Portal do paciente: http://localhost:3000/portal

---

## 5. Pré-consulta híbrida (formulário + IA)

`/formulario` mantém o formulário tradicional **e** oferece a experiência
guiada por IA quando configurada:

- **Flag/config:** Configurações → Inteligência Artificial → "Pré-consulta guiada por IA"
  (ativar + modo `optional`/`default`). Requer provedor + API key.
- **Princípio:** *schema controls what, AI controls how*. O agente
  `PATIENT_INTAKE_ASSISTANT` (`lib/ai/agents/patient/intake/`) apenas apresenta
  e interpreta UM campo autorizado por vez via structured output Zod; o
  servidor valida, detecta contradições e decide o progresso/próximo campo.
- **Fallback:** qualquer falha de IA converte para o formulário tradicional
  pré-preenchido, preservando as respostas.
- Ambos os fluxos finalizam no MESMO serviço canônico
  (`lib/clinical/submit-pre-consultation.ts`) e na MESMA tabela
  `form_submissions`, distinguidos por `submission_source`
  (`traditional` | `ai_guided`).

---

## 6. Fluxo de IA

Há uma única porta de saída para provedores em `lib/ai/gateway/ai-gateway.ts`
(`generate` / `generateStructured` com validação Zod + 1 tentativa de reparo),
que centraliza timeout, tratamento de erro e auditoria de uso. Cada agente
(protocolo, briefing, pré-análise, sugestão de refeição, portal, intake) tem
um perfil próprio, permissões explícitas e ferramentas registradas no tool
registry — a IA nunca grava direto no banco: ações sensíveis/clínicas viram
**propostas** que exigem confirmação humana.

---

## 7. Migrations / schema

Cronologia completa em `db/` (prefixo `YYYYMMDD_NNNN_`). Destaques recentes:
sessões de consulta, propostas de ação de IA, mecanismo de nutrição, e
`patient_intake_sessions` + `form_submissions.submission_source` +
flags de intake em `ai_settings` (`20260812_0037_patient_intake_ai.sql`).

---

## 8. Segurança

- Senhas bcrypt (salt 12); MFA TOTP
- JWT httpOnly + SameSite=Lax; cookie de intake com `Path` restrito
- `proxy.ts` aplica checagem de `Origin` em mutações de `/api/admin`, `/api/portal`
  e `/api/public` (CSRF) + `no-store`
- Cifragem AES-256-GCM (IV aleatório por valor + auth tag) para dados clínicos
- SQL parametrizado e validação Zod em toda fronteira
- Rate limiting por IP (formulário, intake)
- Auditoria em `admin_audit_logs` (sem PHI)
- Proteção contra prompt injection via blocos `wrapUntrustedData` + allow-list de campos

---

## 9. Testes

```bash
npm test                          # Vitest (unitários e de rota)
npm run test:e2e -- --project=chromium-desktop  # Playwright
```

O E2E sobe um shim local de D1 (`e2e/helpers/d1-shim.mjs`) e um executor
determinístico do Intake Agent (`INTAKE_AI_TEST_PROVIDER=deterministic` sob
`E2E_TEST_MODE=1`), sem depender de provedor externo de IA.

---

## Paleta de cores

| Nome | Hex |
|------|-----|
| Sálvia | `#7A9A74` |
| Rosa blush | `#F4C9C6` |
| Bege areia | `#EAD8C2` |
| Creme | `#FAF7F2` |
| Terracota | `#B47F6A` |