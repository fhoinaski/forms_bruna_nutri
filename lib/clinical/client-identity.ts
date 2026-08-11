/**
 * Normalizacao de identidade de cliente para deduplicacao — unico lugar que
 * decide quando dois valores de email/telefone contam como "o mesmo dado".
 *
 * Email: case-insensitive (ja era o comportamento assumido em
 * executeNewClient e em privacy.ts, so nunca tinha sido aplicado de forma
 * consistente/garantida no banco).
 *
 * Telefone: reduzido a digitos, com o DDI 55 removido quando presente — o
 * mesmo formato "local" que lib/repositories/lead-opportunities.ts ja trata
 * como canonico (ele faz o inverso: adiciona "55" na frente de numeros com
 * ate 11 digitos para montar o link do WhatsApp). Nao inventa uma equivalencia
 * nova: só formaliza a que o dominio ja usa em outro lugar.
 */

export function normalizeEmailIdentity(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function normalizePhoneIdentity(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits;
}

export type ClientDuplicateField = "email" | "phone";

export class ClientDuplicateError extends Error {
  constructor(public readonly field: ClientDuplicateField) {
    super(
      field === "email"
        ? "Já existe um paciente cadastrado com esse e-mail."
        : "Já existe um paciente cadastrado com esse telefone."
    );
    this.name = "ClientDuplicateError";
  }
}

/**
 * Traduz a mensagem crua de constraint do D1/SQLite (nunca exposta ao
 * frontend) para o erro de dominio correspondente. Retorna null se a
 * mensagem nao for uma violacao das constraints de identidade de cliente —
 * o chamador deve relancar o erro original nesse caso.
 */
export function mapClientConstraintError(error: unknown): ClientDuplicateError | null {
  if (!(error instanceof Error)) return null;
  if (!/UNIQUE constraint failed/i.test(error.message)) return null;
  if (error.message.includes("clients.email_normalized")) return new ClientDuplicateError("email");
  if (error.message.includes("clients.phone_normalized")) return new ClientDuplicateError("phone");
  return null;
}
