# Meal Plan Target UX

Data: 2026-08-23

## Direção

A experiência alvo deve seguir princípios observados em softwares maduros, sem copiar layout, texto, assets ou comportamento proprietário:

- templates reutilizáveis;
- plano rápido de adaptar durante atendimento;
- listas de equivalentes reutilizáveis;
- quantidade equivalente calculada por motor determinístico;
- nutricionista no controle;
- IA como assistente opcional;
- paciente vê apenas plano aprovado;
- print e portal coerentes.

## Benchmark público consultado

- Nutrium informa templates de plano alimentar importáveis e ajustáveis para o perfil do cliente.
- Nutrium Help documenta criação de plano semanal e templates próprios.
- Nutrium Help documenta alimentos equivalentes com escolha de tipo de equivalência.
- Nutrium página pública de profissionais menciona templates, base alimentar, equivalentes automáticos e portal.
- Dietbox site público e conteúdos públicos de treinamento indicam foco em plano alimentar, aplicativo do paciente e listas/equivalentes como recursos de rotina.

Uso permitido nesta auditoria: princípios de produto.
Não usar: cópia visual, textos proprietários, assets, fluxos protegidos ou código.

## Fluxo alvo

1. Novo plano
   - `Usar modelo`
   - `Criar com IA`
   - `Começar em branco`

2. Usar modelo
   - mostra templates por público/objetivo;
   - informa refeições e listas incluídas;
   - permite prévia antes de criar.

3. Plano criado
   - já estruturado por refeições;
   - itens principais definidos;
   - slots exibem função clínica simples;
   - alternativas ficam resumidas, não abertas por padrão.

4. Revisão
   - nutricionista ajusta alimento/quantidade;
   - gera ou revisa alternativas por refeição/slot;
   - IA pode pedir "mais prático", "sem peixe", "vegetariano", mas só sobre candidatos válidos.

5. Aprovação/publicação
   - valida pendências;
   - cria snapshot publicado;
   - portal e print usam a mesma fonte aprovada.

## Modelo mental da tela

Separar a tela em camadas:

- Plano: título, status, versão, ações de publicar/imprimir/salvar modelo.
- Estrutura: refeições e papéis.
- Item: alimento principal e quantidade prescrita.
- Alternativas: contador e revisão sob demanda.
- Qualidade: pendências de identidade/cálculo antes da publicação.

## Redução de carga

Remover da superfície principal:

- estados técnicos de engine;
- múltiplos sistemas de substituição;
- erro de schema/migração;
- painéis longos por alimento abertos em linha;
- controles raros sempre visíveis.

Manter na superfície principal:

- refeição;
- papel clínico;
- alimento;
- quantidade;
- número de alternativas aprovadas/sugeridas;
- pendência clara quando algo impede publicação.

## Papel da IA

A IA deve:

- interpretar intenção;
- filtrar candidatos por restrições/listas curadas;
- sugerir opções para revisão;
- explicar por que uma alternativa foi sugerida em linguagem clínica simples.

A IA não deve:

- calcular nutrientes;
- inventar quantidade;
- publicar plano;
- aprovar alternativa;
- escolher alimento fora da biblioteca válida.

## Estados esperados

- `Rascunho`: editável, não visível para paciente.
- `Pronto para revisar`: sem erros bloqueantes, alternativas ainda podem estar pendentes.
- `Aprovado`: plano e alternativas aprovados pela nutricionista.
- `Publicado`: portal/print do paciente usam snapshot aprovado.
- `Desatualizado`: editor mostra aviso quando print/portal usam versão diferente.

## Princípios de UI

- Papel visual deve ser clínico: "Leguminosa", "Carboidrato do almoço", "Fruta", "Proteína principal".
- Alternativas devem aparecer como resumo: "4 aprovadas", "2 para revisar".
- O detalhe deve abrir em painel/modal focado.
- Print de rascunho deve ser rotulado como prévia.
- Publicação deve ser uma ação explícita e única.
