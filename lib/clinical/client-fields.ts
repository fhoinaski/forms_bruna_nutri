export type NewClientFieldKey = "name" | "email" | "phone" | "birth_date";

export const NEW_CLIENT_FIELD_ORDER: NewClientFieldKey[] = ["name", "email", "phone", "birth_date"];

export const NEW_CLIENT_FIELD_LABELS: Record<NewClientFieldKey, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  birth_date: "Data de nascimento",
};
