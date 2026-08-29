# Meal Plan Composer UX/UI R6.5.2B — Top toolbar

## `TOP_TOOLBAR`: PASS (já existia, verificado nesta fase — nenhuma reconstrução)

A barra sticky do plano (`MealPlanEditor.tsx`) já satisfazia, ANTES
desta fase, a maior parte do pedido:

| Requisito do pedido | Já existia? | Evidência |
| --- | --- | --- |
| Status Rascunho/Ativo visível | Sim | `{plan.status === "active" ? "Ativo" : "Rascunho"} - v{plan.version}` |
| "Alterações não salvas" | Sim | `saveStateLabel` = "Alterações não salvas" quando `hasUnsavedChanges` |
| "Salvo agora" | Sim | `saveStateLabel` = "Salvo agora" após save bem-sucedido |
| Uma única ação primária | Sim | Só "Revisar"/"Ativo" usa `brand-btn-primary`; todo o resto é `brand-btn-secondary` |
| Publicado = imutável | Sim | `disabled={... || plan.status === "active"}` em Salvar/Revisar; toolbar mostra "Ativo" (desabilitado) em vez de convidar edição |
| "Usar modelo" reaproveita R4 | Sim | Mesmo botão/drawer da R4, nenhum sistema paralelo |
| "Criar com IA" reaproveita R5 | Sim | Mesmo botão/wizard da R5, nenhuma CTA de IA paralela |

**Confirmado por teste dedicado**
(`e2e/meal-plan-ui-r6-5-2b-closure.spec.ts`, "toolbar do Composer"):
conta exatamente 1 `.brand-btn-primary` dentro da barra sticky, com
texto "Revisar"; confirma "Usar modelo" e "Criar com IA" visíveis.

## Gap real: "Última alteração..." (timestamp)

O pedido pede uma linha de metadata "última alteração...". Isso NÃO
existe hoje — `plan` (o objeto usado pelo editor) não carrega um
campo `updated_at` explorável pela UI. Adicionar isso exigiria uma
mudança de contrato de API (buscar/expor `updated_at`), fora do
escopo de uma correção puramente de apresentação. Documentado como
gap real, não escondido.

## Conclusão

O toolbar já atendia ao essencial do pedido (status, feedback de
salvamento, CTA único, reaproveitamento de R4/R5, imutabilidade de
publicado) sem nenhuma mudança de código nesta fase — apenas
verificado e documentado. O único gap real (timestamp de última
alteração) fica registrado, não implementado.
