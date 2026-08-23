# Meal Plan Restructure - Audit Final Report

Data: 2026-08-23
Commit base: `8eb5d45c6b7a7fd0d6165e6dc01bd69293d08cfb`

## Conclusão

A reestruturação é necessária. O problema mais crítico não é um cálculo dobrando gramas; é a falta de contrato explícito entre plano em edição, plano ativo, versão publicada, print e portal.

## Causa raiz da divergência de quantidade

O fixture do template `ADULTO_SAUDAVEL` nasce com:

- Pão integral: 50 g
- Ovo: 100 g
- Banana: 80 g
- Arroz integral: 120 g

O editor seleciona o novo rascunho após criação por modelo. Print e portal, porém, sempre carregam `getActiveMealPlan`. Se já existia um plano ativo com porções 100/200/240, o editor mostra o rascunho novo correto e o print/portal mostram o ativo antigo.

Não foi encontrado caminho em que `quantity = 50 g` seja transformado em `100 g` por `resolveQuantity`, save, hydrate ou print. Para `unit = g`, a resolução usa o próprio número.

## Status dos pipelines

- Quantidade prescrita: parcialmente consistente dentro do plano salvo, inconsistente entre editor e print/portal por fonte diferente.
- Identidade alimentar: inconsistente; templates dependem de resolução por texto.
- Active/draft/version: funcional, mas sem contrato de UX/publicação claro.
- Print/portal: coerentes entre si, mas acoplados ao ativo e sem prévia por `planId`.
- Alternativas: existem dois sistemas coexistindo; precisa convergir.
- Papéis clínicos: motor tem grupo/subgrupo/role, mas UI usa rótulo amplo inadequado em casos como leguminosas.

## Plano R1 sugerido

1. Criar contrato de publicação.
   - Editor por `planId`.
   - Print preview por `planId`.
   - Print/portal do paciente por snapshot ativo/publicado.

2. Criar teste golden P0.
   - Criar cliente.
   - Criar template `ADULTO_SAUDAVEL`.
   - Confirmar editor/save/reload: 50/100/80/120.
   - Ativar.
   - Confirmar print/portal: 50/100/80/120.
   - Confirmar que, antes de ativar, print/portal ainda exibem explicitamente o ativo anterior ou aviso de versão diferente.

3. Canonizar identidade em templates.
   - Seeds com `food_source/ref_id`.
   - Estado explícito para itens sem match.
   - Bloqueio/aviso de publicação.

4. Separar papel técnico e rótulo clínico.
   - `display_role` para UX.
   - Feijão/leguminosas como "Leguminosa" no editor.

5. Convergir alternativas.
   - Curadoria primeiro.
   - Engine calcula quantidade.
   - IA apenas assiste.
   - Aprovação explícita antes de publicar.

6. Simplificar editor.
   - Refeições/itens como tela principal.
   - Alternativas em revisão focada.
   - Mensagens técnicas escondidas em logs.

## Arquivos gerados nesta auditoria

- `reports/meal-plan-restructure-current-state.md`
- `reports/meal-plan-data-contract.md`
- `reports/meal-plan-target-ux.md`
- `reports/system-meal-template-integrity.md`
- `reports/meal-plan-restructure-final.md`

## Markers finais

- `MEAL_PLAN_AUDIT_COMPLETE: sim`
- `QUANTITY_DIVERGENCE_ROOT_CAUSE: divergência entre rascunho selecionado no editor e plano ativo usado por print/portal; não há evidência de multiplicação de quantity em g no save/cálculo`
- `PRINT_EDITOR_DATA_SOURCE_DIVERGENCE: sim`
- `FOOD_IDENTITY_PIPELINE_CONSISTENT: nao`
- `ACTIVE_DRAFT_VERSION_PIPELINE_CONSISTENT: nao`
- `TEMPLATE_INTEGRITY_ISSUES: 6`
- `UX_RESTRUCTURE_NEEDED: sim`

## Gate

Parar aqui. Não iniciar R1 sem confirmação explícita, porque a próxima fase muda contrato de produto e fonte de dados de publicação.
