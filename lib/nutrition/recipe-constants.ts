export const RECIPE_MEAL_GROUPS = ["cafe_da_manha", "almoco", "lanche", "jantar", "sobremesa", "bebida"] as const;
export type RecipeMealGroup = typeof RECIPE_MEAL_GROUPS[number];

export const RECIPE_MEAL_GROUP_LABELS: Record<RecipeMealGroup, string> = {
  cafe_da_manha: "Cafe da manha",
  almoco: "Almoco",
  lanche: "Lanche",
  jantar: "Jantar",
  sobremesa: "Sobremesa",
  bebida: "Bebida",
};
