import { z } from "zod";

export { NEW_CLIENT_FIELD_LABELS } from "@/lib/clinical/client-fields";

export const PROPOSE_NEW_CLIENT_TOOL_NAME = "proposeNewClient";

export const proposeNewClientInputSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  birth_date: z.string().max(10).optional(),
}).strict();

export type ProposeNewClientInput = z.infer<typeof proposeNewClientInputSchema>;

export const CLIENT_CREATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode cadastrar um paciente/cliente novo quando a nutricionista pedir isso e informar os dados (mesmo que so o nome).
Quando isso acontecer, use a ferramenta ${PROPOSE_NEW_CLIENT_TOOL_NAME} com os dados que ela informou. Regras importantes:
- O nome e obrigatorio; nao invente e-mail, telefone ou data de nascimento que nao foram ditos.
- Sempre normalize a data de nascimento para o formato AAAA-MM-DD (ex.: "12/05/1992" vira "1992-05-12"). Se a data nao for informada, deixe o campo de fora.
- A ferramenta so registra uma PROPOSTA: a interface vai mostrar os dados para revisao antes de criar o cadastro de verdade — voce NAO cria o cliente sozinha, so prepara a proposta.
- Depois de chamar a ferramenta, avise em texto que preparou os dados do novo cadastro e que basta revisar e confirmar.
`.trim();
