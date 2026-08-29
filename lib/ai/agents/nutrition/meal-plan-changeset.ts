import { MEAL_KEY_LABELS, type MealKey } from "@/lib/nutrition/draft-types";

/**
 * Forma MÍNIMA de uma refeição regenerada que este módulo precisa pra
 * casar/comparar/mesclar — deliberadamente genérica (não importa o
 * `DraftMeal` completo de `lib/nutrition/draft-types`): o wizard mantém seu
 * próprio tipo local `DraftMeal` (estruturalmente equivalente, mas com
 * `needsReview`/`candidates` tipados de forma um pouco diferente pro
 * cliente) — exigir o tipo exato do servidor aqui criaria acoplamento
 * desnecessário entre os dois lados sem nenhum ganho real de segurança.
 */
interface MinimalNestedItem { food: string; quantity: string | number; food_ref_id?: string | null }

export interface MinimalDraftMeal {
  mealKey: MealKey;
  name: string;
  items: MinimalNestedItem[];
  /** R5.1 — OPTIONS/COMBINATION passam a valer para o changeset também: presentes só quando a refeição regenerada tem essa estrutura. */
  meal_structure?: "SIMPLE" | "OPTIONS" | "COMBINATION" | null;
  options?: Array<{ items: MinimalNestedItem[] }>;
  choice_groups?: Array<{ items: MinimalNestedItem[] }>;
}

/**
 * R5 — "Usar plano anterior como base" (seções 23-29). Nunca reescreve o
 * plano do zero: casa cada `mealKey` do Copilot com a refeição existente
 * mais provável (por nome, único vínculo disponível — planos reais usam
 * nome livre, não o enum fixo `MealKey`), respeita itens/refeições
 * bloqueados (nunca oferece uma refeição bloqueada pra regeneração), e
 * produz um changeset explícito (KEEP/MODIFY/ADD/REMOVE) — nunca troca o
 * plano inteiro silenciosamente.
 *
 * IMPORTANTE (seção 28: "sem reescrita destrutiva"): esta implementação
 * NUNCA remove uma refeição existente sozinha — o Copilot só PROPÕE
 * (mantém/altera/adiciona); remover uma refeição continua sendo uma ação
 * manual da nutricionista no Composer, depois de aplicar a proposta.
 * `remove` no changeset sempre fica vazio nesta fase — documentado, não
 * escondido (ver relatório de arquitetura).
 */

export interface ExistingPlanItem {
  food: string;
  quantity?: string | null;
  food_ref_id?: string | null;
  quantity_locked?: boolean | null;
  substitutions_locked?: boolean | null;
}

export interface ExistingPlanMeal {
  name: string;
  items: ExistingPlanItem[];
  /** R5.1 (seção 28) — itens nested também podem carregar locks; sem isto, uma refeição OPTIONS/COMBINATION com um item bloqueado SÓ dentro de uma opção/grupo escapava da checagem de lock (bug real: só `meal.items` era olhado). */
  options?: Array<{ items: ExistingPlanItem[] }>;
  choice_groups?: Array<{ items: ExistingPlanItem[] }>;
}

/** Achata itens fixos + nested (options/choice_groups) de uma refeição — reaproveitado tanto pelo check de lock quanto pela comparação estrutural, nunca duas lógicas de "todo item desta refeição" divergentes. */
function allNestedItems(meal: Pick<ExistingPlanMeal, "items" | "options" | "choice_groups">): ExistingPlanItem[] {
  return [
    ...meal.items,
    ...(meal.options ?? []).flatMap((option) => option.items),
    ...(meal.choice_groups ?? []).flatMap((group) => group.items),
  ];
}

/**
 * Uma refeição existente está bloqueada pra reescrita do Copilot se
 * QUALQUER item dela (fixo OU dentro de uma opção/grupo de escolha) tiver
 * um lock ativo — nunca regenera parcialmente uma refeição bloqueada,
 * mesmo quando o lock está "escondido" dentro de uma estrutura flexível
 * (seção 28 do pedido R5.1).
 */
export function isMealLockedForCopilot(meal: ExistingPlanMeal): boolean {
  return allNestedItems(meal).some((item) => item.quantity_locked || item.substitutions_locked);
}

function normalizeMealName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Casa um `mealKey` canônico (cafe_da_manha/almoco/...) com a refeição mais
 * provável do plano existente, comparando o NOME real da refeição contra o
 * rótulo humano do slot — nunca por posição/índice (nomes/ordens variam
 * livremente em planos reais). Sem correspondência clara: `null` (a
 * refeição do Copilot vira ADD, nunca um palpite arriscado de MODIFY).
 */
export function matchMealKeyToExisting(existingMeals: ExistingPlanMeal[], key: MealKey): { meal: ExistingPlanMeal; index: number } | null {
  const label = normalizeMealName(MEAL_KEY_LABELS[key]);
  for (let index = 0; index < existingMeals.length; index += 1) {
    const meal = existingMeals[index];
    const normalized = normalizeMealName(meal.name);
    if (normalized === label || normalized.includes(label) || label.includes(normalized)) {
      return { meal, index };
    }
  }
  return null;
}

/** Refeições do plano existente que podem ser oferecidas ao Copilot pra regenerar — exclui as bloqueadas por completo, elas nunca aparecem como opção. */
export function selectableMealKeys(existingMeals: ExistingPlanMeal[], allKeys: MealKey[]): { key: MealKey; locked: boolean; existingName: string | null }[] {
  return allKeys.map((key) => {
    const match = matchMealKeyToExisting(existingMeals, key);
    return { key, locked: match ? isMealLockedForCopilot(match.meal) : false, existingName: match?.meal.name ?? null };
  });
}

function nestedItemListsMatch(draftItems: MinimalNestedItem[], existingItems: ExistingPlanItem[]): boolean {
  if (draftItems.length !== existingItems.length) return false;
  return draftItems.every((item, index) => {
    const other = existingItems[index];
    return other && item.food === other.food && String(item.quantity) === String(other.quantity ?? "") && (item.food_ref_id ?? null) === (other.food_ref_id ?? null);
  });
}

/**
 * Compara a refeição regenerada com a existente por CONTEÚDO — nunca por
 * referência de objeto. R5.1: estrutura-consciente — uma refeição SIMPLE
 * nunca é considerada igual a uma OPTIONS/COMBINATION mesmo com os mesmos
 * itens fixos, e OPTIONS/COMBINATION comparam também options/choice_groups
 * (na mesma ordem — reordenar opções/grupos conta como MODIFY, nunca KEEP
 * silencioso).
 */
export function draftMealMatchesExisting(draftMeal: MinimalDraftMeal, existingMeal: ExistingPlanMeal): boolean {
  const draftStructure = draftMeal.meal_structure ?? "SIMPLE";
  if (!nestedItemListsMatch(draftMeal.items, existingMeal.items)) return false;

  const draftOptions = draftStructure === "OPTIONS" ? (draftMeal.options ?? []) : [];
  const existingOptions = existingMeal.options ?? [];
  if (draftOptions.length !== existingOptions.length) return false;
  for (let index = 0; index < draftOptions.length; index += 1) {
    if (!nestedItemListsMatch(draftOptions[index].items, existingOptions[index].items)) return false;
  }

  const draftGroups = draftStructure === "COMBINATION" ? (draftMeal.choice_groups ?? []) : [];
  const existingGroups = existingMeal.choice_groups ?? [];
  if (draftGroups.length !== existingGroups.length) return false;
  for (let index = 0; index < draftGroups.length; index += 1) {
    if (!nestedItemListsMatch(draftGroups[index].items, existingGroups[index].items)) return false;
  }

  return true;
}

export interface MealPlanChangeset {
  keep: string[];
  modify: string[];
  add: string[];
  remove: string[];
}

/**
 * Calcula o changeset (seção 25/29) comparando o resultado regenerado do
 * Copilot com o que já existia no plano de origem. `regeneratedKeys` são
 * SÓ as chaves que a nutricionista pediu pra (re)gerar — qualquer refeição
 * existente fora dessa lista é sempre KEEP, nunca tocada. Se o resultado
 * regenerado for byte-a-byte igual ao que já existia, conta como KEEP, não
 * MODIFY (evita um "1 alterada" enganoso quando nada realmente mudou).
 */
export function computeMealPlanChangeset(
  existingMeals: ExistingPlanMeal[],
  regeneratedMeals: MinimalDraftMeal[],
  regeneratedKeys: MealKey[]
): MealPlanChangeset {
  const changeset: MealPlanChangeset = { keep: [], modify: [], add: [], remove: [] };
  const touchedExistingIndexes = new Set<number>();

  for (const key of regeneratedKeys) {
    const draftMeal = regeneratedMeals.find((meal) => meal.mealKey === key);
    const match = matchMealKeyToExisting(existingMeals, key);
    if (!draftMeal) continue;
    if (match) {
      touchedExistingIndexes.add(match.index);
      if (draftMealMatchesExisting(draftMeal, match.meal)) {
        changeset.keep.push(match.meal.name);
      } else {
        changeset.modify.push(draftMeal.name || MEAL_KEY_LABELS[key]);
      }
    } else {
      changeset.add.push(draftMeal.name || MEAL_KEY_LABELS[key]);
    }
  }

  existingMeals.forEach((meal, index) => {
    if (touchedExistingIndexes.has(index)) return;
    // Uma refeição existente cujo mealKey correspondente foi PEDIDO mas o
    // Copilot não devolveu nada calculável pra ela (raro, mas possível)
    // continua contando como KEEP — nunca vira REMOVE por omissão.
    changeset.keep.push(meal.name);
  });

  // "remove" nunca é populado nesta fase (seção 28) — documentado acima,
  // nenhuma chave pedida jamais remove uma refeição existente sozinha.
  return changeset;
}

/**
 * Aplica o changeset: mantém as refeições não tocadas exatamente como
 * estavam, substitui as que foram casadas com uma chave regenerada, e
 * acrescenta as novas ao final — na mesma ordem em que os slots aparecem
 * (cafe_da_manha, lanche_manha, almoco, ...). Nunca reordena ou apaga uma
 * refeição que não foi explicitamente marcada pra regeneração.
 */
export function mergeChangesetIntoMeals<TExisting extends ExistingPlanMeal, TDraft extends MinimalDraftMeal, TMerged>(
  existingMeals: TExisting[],
  regeneratedMeals: TDraft[],
  regeneratedKeys: MealKey[],
  convertDraftMeal: (meal: TDraft) => TMerged,
  keepAsIs: (meal: TExisting) => TMerged
): TMerged[] {
  const matchedIndexes = new Map<number, TDraft>();
  const additions: TDraft[] = [];

  for (const key of regeneratedKeys) {
    const draftMeal = regeneratedMeals.find((meal) => meal.mealKey === key);
    if (!draftMeal) continue;
    const match = matchMealKeyToExisting(existingMeals, key);
    if (match) matchedIndexes.set(match.index, draftMeal);
    else additions.push(draftMeal);
  }

  const merged = existingMeals.map((meal, index) => {
    const replacement = matchedIndexes.get(index);
    return replacement ? convertDraftMeal(replacement) : keepAsIs(meal);
  });
  return [...merged, ...additions.map(convertDraftMeal)];
}

export function describeMealPlanChangeset(changeset: MealPlanChangeset): string {
  return `${changeset.keep.length} refeição(ões) mantida(s), ${changeset.modify.length} alterada(s), ${changeset.add.length} adicionada(s), ${changeset.remove.length} removida(s)`;
}
