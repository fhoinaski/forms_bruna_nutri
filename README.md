# Bruna Flores Nutri — Formulário Pré-Consulta

Sistema de formulário pré-consulta para nutricionista, com dashboard administrativo, login seguro, exportação em CSV/Excel e visualização de relatórios em PDF.

**Stack:** Next.js 15 App Router + Vercel + Cloudflare D1

---

## Arquitetura

```
Navegador → Vercel (Next.js) → Cloudflare D1 HTTP API
```

- **Frontend e APIs:** Vercel / Next.js App Router
- **Banco de dados:** Cloudflare D1 (database_id: `5a1f3b97-ba6f-48b0-af09-811117d67d68`)
- **Autenticação:** bcryptjs (hash) + JWT via `jose` (cookie httpOnly 8h)
- **Exportação:** CSV nativo + Excel via `xlsx`

---

## Pré-requisitos

- Conta Vercel
- Conta Cloudflare com acesso ao D1
- Node.js 20+
- `npx wrangler` (para aplicar schema via CLI)

---

## 1. Aplicar schema no D1

```bash
npx wrangler d1 execute forms_bruna_nutri --file=./db/schema.sql --remote
```

Isso cria as tabelas: `form_submissions`, `export_logs`, `admin_audit_logs`, `admin_users`.

---

## 2. Variáveis de ambiente na Vercel

No painel do projeto em **Settings → Environment Variables**:

| Variável | Descrição |
|----------|-----------|
| `CLOUDFLARE_ACCOUNT_ID` | ID da sua conta Cloudflare |
| `CLOUDFLARE_D1_DATABASE_ID` | `5a1f3b97-ba6f-48b0-af09-811117d67d68` |
| `CLOUDFLARE_D1_API_TOKEN` | Token com permissão **D1 Edit** |
| `AUTH_SECRET` | String aleatória para assinar JWTs (min. 32 chars) |

> Nenhuma variável deve ter prefixo `NEXT_PUBLIC_` — todas são server-side.

### Gerar AUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 3. Criar admin inicial

Configure as variáveis localmente em `.env.local`:

```env
CLOUDFLARE_ACCOUNT_ID=seu_account_id
CLOUDFLARE_D1_DATABASE_ID=5a1f3b97-ba6f-48b0-af09-811117d67d68
CLOUDFLARE_D1_API_TOKEN=seu_token
AUTH_SECRET=string_aleatoria_longa_32chars
ADMIN_EMAIL=admin@brunafloresnutri.com
ADMIN_INITIAL_PASSWORD=Trocar@123
ADMIN_NAME=Bruna Flores Nutri
```

Depois rode o script:

```bash
node scripts/create-admin.mjs
# ou: npm run create-admin
```

O script:
- Gera hash bcrypt da senha (salt 12)
- Insere ou atualiza o admin no D1
- Define `must_change_password = 1`
- Exibe confirmação sem mostrar o hash

> **No primeiro acesso, a troca de senha será obrigatória.**

---

## 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse:
- Formulário público: [http://localhost:3000/formulario](http://localhost:3000/formulario)
- Login admin: [http://localhost:3000/login](http://localhost:3000/login)
- Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 5. Deploy na Vercel

```bash
git add .
git commit -m "feat: admin com D1 + bcrypt + mustChangePassword"
git push
```

A Vercel detecta o push e faz o build. Configure as variáveis de ambiente **antes** do primeiro deploy.

---

## 6. Fluxo de login

```
1. POST /api/auth/login
   → bcrypt.compare(senha, hash do D1)
   → JWT httpOnly cookie (8h)
   → retorna { mustChangePassword: true/false }

2. Se mustChangePassword = true
   → redirect /dashboard/settings/security
   → POST /api/auth/change-password
   → bcrypt.compare(senhaAtual) + bcrypt.hash(novaSenha)
   → zera must_change_password no D1
   → log em admin_audit_logs
   → emite novo JWT com mustChangePassword = false
   → redirect /dashboard

3. Middleware protege /dashboard e /api/admin
   → sem sessão → redirect /login ou 401
   → mustChangePassword → só acessa /dashboard/settings/security
```

---

## 7. Rotas da aplicação

### Públicas
| Rota | Descrição |
|------|-----------|
| `GET /formulario` | Formulário pré-consulta |
| `POST /api/form-submissions` | Envia formulário preenchido |
| `POST /api/auth/login` | Login com e-mail + senha (bcrypt) |
| `POST /api/auth/logout` | Logout (limpa cookie) |
| `GET /api/auth/me` | Sessão atual |
| `POST /api/auth/change-password` | Troca de senha (requer sessão) |

### Administrativas (requerem sessão + mustChangePassword = false)
| Rota | Descrição |
|------|-----------|
| `GET /dashboard` | Dashboard com métricas e tabela |
| `GET /dashboard/submissions/:id` | Detalhe + edição de status/notas |
| `GET /dashboard/submissions/:id/print` | Impressão / PDF |
| `GET /dashboard/settings/security` | Troca de senha (acessível com mustChangePassword) |
| `GET /api/admin/submissions` | Lista com filtros e paginação |
| `GET /api/admin/submissions/:id` | Detalhe completo |
| `PATCH /api/admin/submissions/:id` | Atualiza status e notas |
| `GET /api/admin/export/csv` | Exporta CSV |
| `GET /api/admin/export/excel` | Exporta Excel (3 abas) |

---

## 8. Schema do banco D1

```sql
form_submissions      -- formulários recebidos
export_logs           -- log de exportações
admin_audit_logs      -- auditoria (ex: password_changed)
admin_users           -- admins com senha hasheada bcrypt
```

---

## 9. Segurança

- Senha nunca em texto puro — bcrypt salt 12
- Token Cloudflare D1 **nunca** exposto ao cliente
- JWT httpOnly cookie (8h)
- `mustChangePassword` forçado no primeiro acesso
- SQL parametrizado em todas as queries
- Validação Zod em todas as entradas
- Erros internos não vazam stack trace
- Comparação de senha em tempo constante (evita timing attacks)
- Auditoria de troca de senha em `admin_audit_logs`

---

## Paleta de cores

| Nome | Hex |
|------|-----|
| Sálvia | `#7A9A74` |
| Rosa blush | `#F4C9C6` |
| Bege areia | `#EAD8C2` |
| Creme | `#FAF7F2` |
| Terracota | `#B47F6A` |
