import { Resend } from "resend";

export class EmailConfigurationError extends Error {
  constructor(message = "Envio de e-mail nao configurado.") {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let resendClient: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new EmailConfigurationError("Configure RESEND_API_KEY e EMAIL_FROM para enviar e-mails.");
  }

  resendClient ??= new Resend(apiKey);
  return { resend: resendClient, from };
}

export async function sendEmail(input: SendEmailInput) {
  const { resend, from } = getResendClient();
  if (process.env.RESEND_API_KEY === "mock") {
    return { id: `mock-${Date.now()}`, from, to: input.to };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(error.message || "Falha ao enviar e-mail.");
  }

  return data;
}
