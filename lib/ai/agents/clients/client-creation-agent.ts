import { z } from "zod";
import { PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";
import { getClients } from "@/lib/repositories/clients";

export { NEW_CLIENT_FIELD_LABELS } from "@/lib/clinical/client-fields";

export const PROPOSE_NEW_CLIENT_TOOL_NAME = "proposeNewClient";

export const proposeNewClientInputSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  birth_date: z.string().max(10).optional(),
}).strict();

export type ProposeNewClientInput = z.infer<typeof proposeNewClientInputSchema>;

function normalizeBirthDate(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return trimmed;
}

function normalizeNullable(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export type ProposeNewClientOutput = {
  proposal: ProposeNewClientInput;
  possibleDuplicates: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
};

export async function executeProposeNewClient(input: ProposeNewClientInput): Promise<ProposeNewClientOutput> {
  const proposal: ProposeNewClientInput = {
    name: input.name.trim(),
    email: normalizeNullable(input.email),
    phone: normalizeNullable(input.phone),
    birth_date: normalizeBirthDate(input.birth_date),
  };

  const searchTerms = [proposal.email, proposal.phone, proposal.name].filter(Boolean) as string[];
  const seen = new Set<string>();
  const possibleDuplicates: ProposeNewClientOutput["possibleDuplicates"] = [];
  for (const search of searchTerms) {
    const result = await getClients({ search, pageSize: 5 });
    for (const client of result.items) {
      if (seen.has(client.id)) continue;
      seen.add(client.id);
      possibleDuplicates.push({ id: client.id, name: client.name, email: client.email, phone: client.phone });
    }
  }

  return { proposal, possibleDuplicates };
}

export const CLIENT_CREATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode cadastrar um paciente/cliente novo quando a nutricionista pedir isso e informar os dados (mesmo que so o nome).
Quando isso acontecer, use a ferramenta ${PROPOSE_NEW_CLIENT_TOOL_NAME} com os dados que ela informou. Regras importantes:
- O nome e obrigatorio; nao invente e-mail, telefone ou data de nascimento que nao foram ditos.
- Sempre normalize a data de nascimento para o formato AAAA-MM-DD (ex.: "12/05/1992" vira "1992-05-12"). Se a data nao for informada, deixe o campo de fora.
- A ferramenta verifica possiveis duplicidades por nome, e-mail e telefone. Se ela retornar possiveis duplicados, mostre isso com clareza antes de pedir confirmacao.
- ${PROPOSAL_DISCLAIMER}
- Depois de chamar a ferramenta, avise em texto que preparou os dados do novo cadastro e que basta revisar e confirmar.
`.trim();
