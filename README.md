# Sistema de Pré-Consulta · Bruna Flores Nutri

Sistema completo construído com Next.js (App Router), TailwindCSS, e SQLite local (preparado para Cloudflare D1).

## Funcionalidades
1.  **Formulário Público (`/formulario`)**: Uma landing page limpa e profissional baseada nos estilos de marca fornecidos.
2.  **API e Persistência**: Salva eficientemente no banco de dados SQLite (usado no preview via \`better-sqlite3\`).
3.  **Dashboard Admin (`/dashboard`)**: Protegido por senha definida na variável \`ADMIN_PASSWORD\`. Exibe métricas, tabela e detalhes.
4.  **Exportação CSV**: Permite baixar todos os registros em formato de planilha.
5.  **Geração em PDF**: Layout próprio para impressão da resposta individual de cada paciente.

## Variáveis de Ambiente necessárias (.env)
\`\`\`env
ADMIN_PASSWORD="minha_senha_super_segura"
\`\`\`

## Execução Local (Preview)
O AI Studio vai compilar e abrir automaticamente o formulário em \`/formulario\`.
O acesso ao dashboard é na rota \`/login\` usando a senha padrão: \`admin123\`.

## Deploy para a Cloudflare Pages + D1

Atualmente a aplicação usa o \`better-sqlite3\` para funcionar perfeitamente dentro deste ambiente Docker de pré-visualização. Para colocar no ar na **Cloudflare Pages**, algumas trocas são necessárias:

### 1. Remover dependência local
\`\`\`bash
npm uninstall better-sqlite3 @types/better-sqlite3
npm install @opennextjs/cloudflare
\`\`\`

### 2. Mudar a conexão do DB (db/index.ts)
A Drizzle suporta D1 nativamente. Em vez de chamar o sqlite3, no diretório \`/db\` você injetaria o Cloudflare D1 localmente através de variáveis de ambiente do contexto de Requests do NextJS.
Veja o guia oficial da Cloudflare: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-nextjs-site/

### 3. Deploy
\`\`\`bash
npm run build
npx wrangler pages deploy .vercel/output/static
\`\`\`
