# Inventário de Funcionalidades — Bruna Flores Nutri

> Gerado por auditoria de código em 2026-08-17. Ver [`SYSTEM-COMPLETE-GUIDE.md`](./SYSTEM-COMPLETE-GUIDE.md) para detalhes técnicos de cada linha.

Legenda de **STATUS**: ✅ Implementado · 🟡 Parcial · 🧩 Infraestrutura existente, não exposta como feature · ⛔ Não implementado.
Legenda de **IA**: — nenhuma · R leitura · P proposta (confirmação obrigatória) · A auto-executa (risco baixo, nunca clínico/sensível).

| MÓDULO | FUNCIONALIDADE | STATUS | ROTA | PERFIL | IA | WRITE | CONFIRMAÇÃO | OBSERVAÇÕES |
|---|---|---|---|---|---|---|---|---|
| Público | Home institucional | ✅ | `/` | público | — | — | — | Estático + SEO/JSON-LD |
| Público | Serviços | ✅ | `/servicos` | público | — | — | — | |
| Público | Como funciona | ✅ | `/como-funciona` | público | — | — | — | |
| Público | Política de privacidade + solicitação LGPD | ✅ | `/privacidade` | público | — | — | — | Formulário público, rate-limited |
| Público | Termos de uso | ✅ | `/termos` | público | — | — | — | |
| Público | Blog (lista/post) | ✅ | `/blog`, `/blog/[slug]` | público | — | — | — | SSR dinâmico, JSON-LD `BlogPosting` |
| Público | Feed RSS | ✅ | `/feed.xml` | público | — | — | — | |
| Pré-consulta | Formulário tradicional | ✅ | `/formulario` | público | — | Sim | — | react-hook-form+zod, autosave local, honeypot |
| Pré-consulta | Formulário guiado por IA | ✅ | `/formulario` | público | R (extração de resposta) | Sim | — | Decisão de modo é 100% do servidor; degrada para tradicional se IA indisponível |
| Pré-consulta | Persistência única (form_submissions) | ✅ | `/api/form-submissions`, `/api/public/pre-consultation/intake/complete` | API pública | — | Sim | — | Caminho único para os 2 fluxos; `answers_json` cifrado |
| Pré-consulta | Consentimento LGPD automático | ✅ | (interno) | — | — | Sim | — | `consent_records` a cada submissão |
| Pré-consulta | Criação automática de oportunidade | ✅ | (interno) | — | — | Sim | — | `lead_opportunities` |
| Login/Segurança | Login admin + MFA | ✅ | `/login`, `/api/auth/login` | admin | — | — | — | TOTP real, rate-limited 8/15min |
| Login/Segurança | Troca de senha | ✅ | `/dashboard/settings/security` | admin | — | Sim | — | Invalida sessões antigas |
| Login/Segurança | MFA setup/verify/disable | ✅ | `/api/admin/security/mfa` | admin | — | Sim | Senha+código | Códigos de recuperação (1x visíveis) |
| Login/Segurança | Sessão do portal do paciente | ✅ | `/api/portal/login` | paciente | — | — | — | Cookie + código, revogável na hora |
| Login/Segurança | Rate limiting persistido | ✅ | (interno, `security_rate_limits`) | — | — | — | — | Sobrevive a deploy/reinício |
| Login/Segurança | Criptografia por propósito (clinical/mfa/backup) | ✅ | (interno) | — | — | — | — | Cadeia de chaves, rotação sem migração |
| Login/Segurança | CSRF (checagem de origem) | ✅ | `proxy.ts` | — | — | — | — | Mesma-origem, não token CSRF completo |
| Dashboard | Feed de ações (Agora/Atenção/Negócio/Recente) | ✅ | `/dashboard` | admin | R | — | — | 9 tipos de item, polling 60s + refresh no foco |
| Dashboard | Métricas agregadas | ✅ | `/api/admin/dashboard-metrics` | admin | R (`getSystemOverview`) | — | — | |
| Dashboard | Briefing proativo de consulta | ✅ | `/api/admin/appointments/[id]/brief` | admin | R/geração | — | — | Estados pending→ready/stale/failed |
| Pacientes | CRUD de paciente | ✅ | `/dashboard/clients` | admin | R (`findClient`, `getPatientSummary`), P (`proposeNewClient`) | Sim | Sim (proposta) | |
| Pacientes | Exclusão de paciente | ✅ | `/api/admin/clients/[id]` | admin | — | Sim | UI (modal) | **Hard delete irreversível**, cascata completa |
| Pacientes | Acesso ao portal (gerar/revogar código) | ✅ | `/api/admin/clients/[id]/portal-access` | admin | — | Sim | — | Código HMAC-hash, nunca em claro |
| Prontuário | Anamnese estruturada | ✅ | ficha do paciente | admin | P (`proposeNutritionRecord`) | Sim | Sim | Campos de texto cifrados |
| Prontuário | Versionamento do prontuário | ✅ | `/api/admin/clients/[id]/nutrition-record/versions` | admin | — | Sim | — | Histórico imutável cifrado |
| Marcadores clínicos | Criar/resolver marcador estruturado | ✅ | ficha do paciente, aba Anamnese | admin | R (`getPatientClinicalMarkers`), P (`proposeClinicalMarkerUpsert`/`proposeResolveClinicalMarker`) | Sim | Sim | Vocabulário fechado (7 tipos, 10+5 códigos); MILK≠LACTOSE, WHEAT≠GLUTEN confirmados distintos |
| Marcadores clínicos | Sugestão automática (IA lê texto livre) | ✅ | (interno) | admin | R | — | Aceite/recusa manual | Recusa não cria linha, só evento de auditoria |
| Antropometria | Registro + histórico | ✅ | ficha do paciente, aba Antropometria | admin | R (`compareAnthropometry`, Modo Consulta) | Sim | — | IMC, RCQ, RCE, composição corporal (Jackson&Pollock 7 dobras), gestacional |
| Plano alimentar | Criar por modelo | ✅ | `/api/admin/clients/[id]/meal-plans` (POST) | admin | — | Sim | — | |
| Plano alimentar | Editar refeições/itens | ✅ | editor do plano | admin | P (`proposeMealPlanChange`) | Sim | Sim (via IA) / direto (UI) | Busca unificada TACO/USDA/custom |
| Plano alimentar | Duplicar refeição/alimento/plano | ✅ | editor do plano | admin | — | Sim | — | Cópia local até salvar |
| Plano alimentar | Reordenar refeições/itens | ✅ | editor do plano | admin | — | Sim | — | |
| Plano alimentar | Medida caseira (household measure) | ✅ | editor do plano | admin | — | Sim | — | Prioridade máxima na resolução de gramas |
| Plano alimentar | Macros/micros em tempo real | ✅ | editor do plano | admin | — | — | — | 4 macros no cliente, ~34 nutrientes no servidor |
| Plano alimentar | Salvar como template | ✅ | `.../save-as-template` | admin | — | Sim | — | |
| Plano alimentar | Ativar plano | ✅ | `PUT` com `status:active` | admin | P (`proposeActivateMealPlan`) | Sim | Sim (via IA) / direto (UI) | Arquiva o anteriormente ativo automaticamente |
| Plano alimentar | Versionamento + conflito 409 | ✅ | `PUT .../meal-plans/[planId]` | admin | — | Sim | UI (banner + Recarregar) | Comprovado com 2 abas reais (E2E) — sem sobrescrita silenciosa |
| Plano alimentar | Histórico de versões | ✅ | `.../versions`, `.../versions/[version]` | admin | — | — | — | Snapshot cifrado imutável |
| Plano alimentar | Snapshot de prescrição | ✅ | (interno) | — | — | Sim | — | Nome+nutrição+gramas congelados no save |
| Base de alimentos | Busca unificada (TACO/USDA/custom/fabricante) | ✅ | `/dashboard/alimentos` | admin | R (`searchFoods`) | — | — | Limiar local-vs-USDA = 5 resultados |
| Base de alimentos | Detalhe + calculadora de quantidade | ✅ | `/dashboard/alimentos` | admin | R (`getFoodDetails`, `calculateFoodNutrients`) | — | — | Mesma engine do plano alimentar |
| Base de alimentos | Comparador (até 4 alimentos) | ✅ | `/dashboard/alimentos` | admin | — | — | — | Sempre por 100g |
| Base de alimentos | Cadastro de alimento personalizado/fabricante | ✅ | `/api/admin/custom-foods` | admin | — | Sim | — | |
| Base de alimentos | Perfil clínico do alimento (traços) | ✅ | `/api/admin/custom-foods/[id]/clinical-profile` | admin | — | Sim | — | Só CUSTOM/MANUFACTURER editável; USDA sem suporte ainda |
| Substituições | Substituição profissional (lista no plano) | ✅ | editor do plano | admin | — | Sim | — | Texto livre, dedupe corrigido (escrita+leitura) |
| Substituições | Substituição segura do paciente (auto_safe) | ✅ | portal, chat de IA | paciente | R (`searchAllowedFoodAlternatives`) | Não | — | Nunca altera o plano — só o que o chat pode dizer |
| Substituições | Substituição que requer revisão | ✅ | portal → Solicitações | paciente | P (`requestProfessionalReview`) | Sim | Sim (paciente) | TACO-não-confiável/USDA/CUSTOM/MANUFACTURER sempre cai aqui |
| Agenda | CRUD de consulta | ✅ | `/dashboard/agenda` | admin | R (várias), P (`proposeNewAppointment`/`Reschedule`/`Cancel`) | Sim | Sim (via IA) / direto (UI) | |
| Agenda | Disponibilidade (regras + bloqueios) | ✅ | `/dashboard/agenda/disponibilidade` | admin | R (`getAvailableSlots`) | Sim | — | |
| Agenda | Lembretes automáticos (WhatsApp+e-mail) | ✅ | (interno, cron) | — | — | Sim | — | 4 etapas por consulta |
| Agenda | Integração Google Calendar | ⛔ | — | — | — | — | — | **Confirmado ausente** — busca exaustiva sem resultado |
| Consulta | Modo Consulta (sessão ao vivo) | ✅ | `/dashboard/clients/[id]/consulta` | admin | R (`getConsultationBrief` e mais), P (`proposeConsultationNote`/`Summary`/`TasksBatch`) | Sim | Sim | Máx. 1 sessão ativa por paciente (garantido no banco) |
| Consulta | Briefing de IA | ✅ | (interno) | admin | R/geração | — | — | Cifrado |
| Protocolos | Biblioteca de protocolos (standard) | ✅ | `/dashboard/protocols` | admin | — | Sim | — | |
| Protocolos | Aplicar protocolo a paciente | ✅ | `/api/admin/clients/[id]/protocols` | admin | — | Sim | — | Modo apply ou create_personalized |
| Protocolos | Rascunho de protocolo por IA | ✅ | `/dashboard/ai-protocol-drafts/[id]` | admin | Geração + edição | Sim | Aprovação manual | Só vira protocolo oficial se `approved` |
| Protocolos | Write de IA para evolução/status de protocolo | ⛔ | — | admin | — | — | — | Bloqueado por falta de audit trail nesses 2 repositórios (documentado) |
| Financeiro | CRUD de cobrança | ✅ | `/dashboard/financeiro` | admin | R (várias), P (`proposeMarkPaymentReceived`) | Sim | Sim (via IA) / direto (UI) | 100% manual |
| Financeiro | Lembrete de vencido (cron) | ✅ | (interno) | — | — | Sim | — | E-mail apenas |
| Financeiro | Gateway de pagamento real | ⛔ | — | — | — | — | — | **Confirmado ausente** — nenhum Stripe/PagSeguro/MP/Pix API |
| Solicitações | Inbox de solicitações do paciente | ✅ | `/dashboard/solicitacoes` | admin | R (`getPatientRequests`), P (`proposeResolvePatientRequest`) | Sim | Sim (via IA) / direto (UI) | Resolver = bookkeeping, não aplica mudança clínica |
| Solicitações | Criação via proposta do paciente | ✅ | portal, chat de IA | paciente | P (`requestProfessionalReview`) | Sim | Sim (paciente) | Nunca escrita direta |
| Portal do paciente | Login (e-mail+código) | ✅ | `/portal` | paciente | — | — | — | |
| Portal do paciente | Ver plano/consultas/tarefas/financeiro | ✅ | `/portal` | paciente | — | — | — | Financeiro é só leitura |
| Portal do paciente | Confirmar presença / autoagendar | ✅ | `/api/portal/appointments/**` | paciente | P (`requestAppointment`) | Sim | Sim (paciente) | Máx. 1 consulta futura ativa |
| Portal do paciente | Concluir tarefa | ✅ | `/api/portal/tasks/[id]` | paciente | — | Sim | — | |
| Portal do paciente | Assistente de IA do portal | ✅ | `/portal` (widget) | paciente | R+P (10 tools) | Sim (via proposta) | Sim (paciente) | Nunca aceita `clientId` do cliente — sempre sessão |
| Documentos | Impressão (window.print) | ✅ | `.../print` (várias) | admin | — | — | — | |
| Documentos | Geração de PDF server-side | ⛔ | — | — | R (`getPatientDocumentLinks` só retorna links de impressão) | — | — | **Confirmado ausente** — evolução futura documentada |
| Assistente de IA | Chat administrativo | ✅ | `/api/admin/ai/chat` | admin | R+P (64 tools) | Sim (via proposta) | Sim | 2 orquestradores separados (admin/paciente) |
| Assistente de IA | Motor de propostas (propose→confirm→revalidar→executar→audit) | ✅ | `/api/admin/ai/proposals/**`, `/api/portal/ai/proposals/**` | admin+paciente | — | Sim | Sim | TTL 15min, idempotência, anti-replay |
| Assistente de IA | Recuperação de propostas travadas | ✅ | `/dashboard/ai-recovery` | admin | — | Sim | UI | Classificação automatic/manual por kind |
| Assistente de IA | Defesas anti prompt-injection | ✅ | (interno) | — | — | — | — | 9 mecanismos concretos, confirmados em teste manual |
| Configurações | Provedor/modelo/prompts de IA | ✅ | `/dashboard/settings/ai` | admin | R (`getAiSettings`) | Sim | — | Chave sempre mascarada |
| Configurações | Modo de pré-consulta | ✅ | `/dashboard/settings/ai` | admin | — | Sim | — | |
| Configurações | Flag de substituições seguras | ✅ | `/dashboard/settings/ai` | admin | P (`proposeUpdateSafeSubstitutionsSetting`) | Sim | Sim (via IA) / direto (UI) | |
| Admin | Health check | ✅ | `/api/health` | admin/monitoramento | R (`getSystemHealth`) | — | — | Só checa env vars, não conexão real com D1 |
| Admin | Audit log | ✅ | (consumido por Privacidade + `getAuditLogSummary`) | admin | R (mascarado) | — | — | Sem página dedicada de "visualizador" |
| Admin | Multi-admin / RBAC | ⛔ | — | — | — | — | — | Confirmado design single-admin intencional |
| Blog | CRUD + publicação manual | ✅ | `/dashboard/blog` | admin | P (`proposeNewBlogPost`), R (`searchEditorialSources`) | Sim | Sim (via IA) / direto (UI) | |
| Blog | Endpoint para agente externo | ✅ | `/api/agent/blog-posts` | bearer token | — | Sim | Sempre vira rascunho | Nunca publica sozinho, mesmo se pedido |
| Privacidade/LGPD | Solicitação de titular | ✅ | `/privacidade`, `/dashboard/privacidade` | público+admin | — | Sim | Verificação manual de identidade | |
| Privacidade/LGPD | Anonimização/exportação | ✅ | `/api/admin/privacy/[id]/**` | admin | — | Sim | Gate de verificação | Exportação em JSON, não PDF |
| Privacidade/LGPD | Expurgo automático por retenção | 🟡 | `/dashboard/privacidade` | admin | — | — | — | Prévia existe; automação não confirmada nesta auditoria |
| Backup | Backup/restore cifrado | ✅ | `scripts/backup-d1.mjs`/`restore-d1.mjs` | operacional (CLI) | — | Sim | `RESTORE_CONFIRM` env var | Restauração não-destrutiva |
| Infra | Multi-tenant | ⛔ | — | — | — | — | — | |
| Infra | White-label | ⛔ | — | — | — | — | — | |
| Infra | Assinatura eletrônica | ⛔ | — | — | — | — | — | |
| Infra | Storage documental do paciente | ⛔ | — | — | — | — | — | Anexo ao chat é processado na hora, não persistido como "documento" |
| Infra | WhatsApp API oficial | 🟡 | — | — | — | Sim (lembretes) | — | Envio real aparenta ser link manual (`wa.me/`) — não re-verificado linha a linha nesta rodada, sinalizar para confirmação |

---

**Contagens confirmadas**: 161 rotas/endpoints · 74 tools de IA (64 admin + 10 paciente) · 14 domínios de IA (nenhum descoberto) · 22 kinds de proposta · 50 migrações · ~70 tabelas · 133 arquivos de teste unitário (1120/1120 passando) · 17 specs E2E.
