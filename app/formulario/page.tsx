"use client";

import { FieldErrors, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormResponseSchema, FormResponseInput } from "@/validators/form";
import { useState, useEffect } from "react";
import React from "react";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Clock3, HeartHandshake, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PreConsultationDynamic } from "@/components/public/intake/PreConsultationDynamic";

const AUTOSAVE_KEY = "bruna-nutri-preconsulta-draft-v1";

const DEFAULT_VALUES: Partial<FormResponseInput> = {
  tipoAtendimento: "",
  objetivo: "",
  sintomas: "",
  child_name: "",
  child_age: "",
  child_weight_kg: "",
  child_height_cm: "",
  child_birth_date: "",
  child_breastfeeding: "",
  child_food_repertoire: "",
  child_feeding_difficulties: "",
  child_school_routine: "",
  anticoncepcional: undefined,
  gestante: undefined,
  semComer: undefined,
  comerEmocao: undefined,
  descansada: undefined,
  estresse: undefined,
  intestinoFreq: undefined,
  desconforto: undefined,
  disposicao: "5",
  privacyAccepted: false as true,
  companyWebsite: "",
};

const BASE_REQUIRED_FIELDS = ["nome", "whatsapp", "email", "privacyAccepted"] as const;
const PEDIATRIC_REQUIRED_FIELDS = ["child_name", "child_age"] as const;
const FORM_FIELD_ORDER = [
  "tipoAtendimento",
  "nome",
  "idade",
  "nascimento",
  "child_name",
  "child_age",
  "child_weight_kg",
  "child_height_cm",
  "child_birth_date",
  "child_breastfeeding",
  "child_food_repertoire",
  "child_feeding_difficulties",
  "child_school_routine",
  "whatsapp",
  "email",
  "profissao",
  "cidade",
  "motivacao",
  "objetivo",
  "incomodo",
  "diagnostico",
  "medicacao",
  "anticoncepcional",
  "gestante",
  "gestational_details",
  "bariatric_details",
  "sintomas",
  "suplementos",
  "suplementosNegativo",
  "rotina",
  "semComer",
  "comerEmocao",
  "fomeDia",
  "sonoHoras",
  "descansada",
  "estresse",
  "atividadeFisica",
  "intestinoFreq",
  "desconforto",
  "naoGosta",
  "favoritos",
  "diaAlimentar",
  "expectativas",
  "disposicao",
  "espacoLivre",
  "privacyAccepted",
] as const satisfies readonly (keyof FormResponseInput)[];

const AUTOSAVE_SECTIONS: Array<{ id: string; fields: readonly (keyof FormResponseInput)[] }> = [
  { id: "tipo_atendimento", fields: ["tipoAtendimento"] },
  { id: "sobre_voce", fields: ["nome", "idade", "nascimento", "whatsapp", "email", "profissao", "cidade"] },
  { id: "crianca", fields: ["child_name", "child_age", "child_weight_kg", "child_height_cm", "child_birth_date", "child_breastfeeding", "child_food_repertoire", "child_feeding_difficulties", "child_school_routine"] },
  { id: "momento_atual", fields: ["motivacao", "objetivo", "incomodo"] },
  { id: "historico_saude", fields: ["diagnostico", "medicacao", "anticoncepcional", "gestante", "gestational_details", "bariatric_details", "sintomas"] },
  { id: "suplementacao", fields: ["suplementos", "suplementosNegativo"] },
  { id: "rotina_comportamento", fields: ["rotina", "semComer", "comerEmocao", "fomeDia"] },
  { id: "estilo_vida", fields: ["sonoHoras", "descansada", "estresse", "atividadeFisica"] },
  { id: "saude_intestinal", fields: ["intestinoFreq", "desconforto"] },
  { id: "preferencias", fields: ["naoGosta", "favoritos"] },
  { id: "rotina_essencial", fields: ["diaAlimentar"] },
  { id: "expectativas", fields: ["expectativas", "disposicao"] },
  { id: "espaco_livre", fields: ["espacoLivre", "privacyAccepted"] },
];

const AUTOSAVE_FIELD_NAMES = AUTOSAVE_SECTIONS.flatMap((section) => section.fields);

function hasFilledValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function isDefaultValue(field: keyof FormResponseInput, value: unknown) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_VALUES, field) && DEFAULT_VALUES[field] === value;
}

function buildDraftBySection(values: Partial<FormResponseInput>) {
  return AUTOSAVE_SECTIONS.reduce<Record<string, Partial<FormResponseInput>>>((draft, section) => {
    const sectionValues = section.fields.reduce<Partial<FormResponseInput>>((acc, field) => {
      const value = values[field];
      if (hasFilledValue(value) && !isDefaultValue(field, value)) {
        acc[field] = value as never;
      }
      return acc;
    }, {});

    if (Object.keys(sectionValues).length > 0) {
      draft[section.id] = sectionValues;
    }

    return draft;
  }, {});
}

function flattenDraft(draft: unknown): Partial<FormResponseInput> {
  if (!draft || typeof draft !== "object") return {};
  return Object.values(draft as Record<string, unknown>).reduce<Partial<FormResponseInput>>((acc, section) => {
    if (section && typeof section === "object") {
      Object.assign(acc, section);
    }
    return acc;
  }, {});
}

function isPediatricProfile(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  return normalized.includes("infantil") || normalized.includes("tea") || normalized.includes("introdu") || normalized.includes("seletividade");
}

function isPregnancyProfile(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  return normalized.includes("gesta") || normalized.includes("parto");
}

function isBariatricProfile(value: string | null | undefined) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("bariatri");
}

export default function FormularioPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitError, setSubmitError] = useState("");
  const [draftStatus, setDraftStatus] = useState<"restored" | "saved" | "cleared" | "">("");
  const [draftReady, setDraftReady] = useState(false);
  const [aiAvailability, setAiAvailability] = useState<{ available: boolean; effectiveMode: "smart" | "traditional"; aiAvailable: boolean; reason?: string } | null>(null);
  const [dynamicActive, setDynamicActive] = useState(false);
  const [intakePrefill, setIntakePrefill] = useState<Record<string, unknown> | null>(null);

  const { control, register, handleSubmit, setValue, getValues, reset, setFocus, formState: { errors } } = useForm<FormResponseInput>({
    resolver: zodResolver(FormResponseSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const requiredValues = useWatch({ control, name: [...BASE_REQUIRED_FIELDS, ...PEDIATRIC_REQUIRED_FIELDS] });
  const autosaveValues = useWatch({ control, name: AUTOSAVE_FIELD_NAMES });
  const tipoAtendimento = useWatch({ control, name: "tipoAtendimento" });
  const objetivo = useWatch({ control, name: "objetivo" });
  const sintomas = useWatch({ control, name: "sintomas" });
  const anticoncepcional = useWatch({ control, name: "anticoncepcional" });
  const gestante = useWatch({ control, name: "gestante" });
  const semComer = useWatch({ control, name: "semComer" });
  const comerEmocao = useWatch({ control, name: "comerEmocao" });
  const descansada = useWatch({ control, name: "descansada" });
  const estresse = useWatch({ control, name: "estresse" });
  const intestinoFreq = useWatch({ control, name: "intestinoFreq" });
  const desconforto = useWatch({ control, name: "desconforto" });
  const disposicao = useWatch({ control, name: "disposicao" });
  const isPediatric = isPediatricProfile(tipoAtendimento);
  const isPregnancy = isPregnancyProfile(tipoAtendimento);
  const isBariatric = isBariatricProfile(tipoAtendimento);

  useEffect(() => {
    if (!isPediatric) {
      return;
    }

    setValue("anticoncepcional", undefined, { shouldValidate: false, shouldDirty: false });
    setValue("gestante", undefined, { shouldValidate: false, shouldDirty: false });
    setValue("semComer", undefined, { shouldValidate: false, shouldDirty: false });
    setValue("comerEmocao", undefined, { shouldValidate: false, shouldDirty: false });
  }, [isPediatric, setValue]);

  useEffect(() => {
    const activeRequiredValues = isPediatric ? requiredValues : requiredValues.slice(0, BASE_REQUIRED_FIELDS.length);
    setProgress(Math.min(100, Math.round((activeRequiredValues.filter(hasFilledValue).length / activeRequiredValues.length) * 100)));
  }, [isPediatric, requiredValues]);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(AUTOSAVE_KEY);
      if (rawDraft) {
        const restored = flattenDraft(JSON.parse(rawDraft));
        reset({ ...DEFAULT_VALUES, ...restored });
        setDraftStatus("restored");
      }
    } catch {
      window.localStorage.removeItem(AUTOSAVE_KEY);
    } finally {
      setDraftReady(true);
    }
  }, [reset]);

  useEffect(() => {
    if (!draftReady || isSuccess) return;
    const timer = window.setTimeout(() => {
      const draft = buildDraftBySection(getValues());
      if (Object.keys(draft).length > 0) {
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
        setDraftStatus("saved");
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [autosaveValues, draftReady, getValues, isSuccess]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/pre-consultation/intake/availability", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const effectiveMode = (data.effectiveMode === "smart" ? "smart" : "traditional") as "smart" | "traditional";
        const availability: {
          available: boolean;
          effectiveMode: "smart" | "traditional";
          aiAvailable: boolean;
          reason?: string;
        } = {
          available: Boolean(data.available),
          effectiveMode,
          aiAvailable: Boolean(data.aiAvailable),
          reason: typeof data.reason === "string" ? data.reason : undefined,
        };
        setAiAvailability(availability);
        // Decisão centralizada no servidor (resolvePublicPreConsultationMode):
        // o paciente NÃO escolhe; só a nutricionista decide no dashboard.
        if (availability.effectiveMode === "smart") setDynamicActive(true);
      })
      .catch(() => {
        if (!cancelled) setAiAvailability({ available: false, effectiveMode: "traditional", aiAvailable: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Aplica prefill vindo do fallback da IA no formulário tradicional.
  useEffect(() => {
    if (!intakePrefill) return;
    const prefill = { ...DEFAULT_VALUES } as Record<string, unknown>;
    for (const [key, value] of Object.entries(intakePrefill)) {
      if (value === undefined || value === null) continue;
      prefill[key] = value;
    }
    reset(prefill as Partial<FormResponseInput>);
    setDraftStatus("restored");
  }, [intakePrefill, reset]);

  const onSubmit = async (data: FormResponseInput) => {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao enviar resposta");
      window.localStorage.removeItem(AUTOSAVE_KEY);
      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Não foi possível enviar agora. Confira sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = (formErrors: FieldErrors<FormResponseInput>) => {
    setSubmitError("Revise os campos destacados antes de enviar.");
    const firstField = FORM_FIELD_ORDER.find((field) => formErrors[field]);
    if (!firstField) return;

    window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[name="${firstField}"], #${firstField}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        try {
          setFocus(firstField);
        } catch {
          element?.focus();
        }
      }, 250);
    });
  };

  const clearDraft = () => {
    window.localStorage.removeItem(AUTOSAVE_KEY);
    reset(DEFAULT_VALUES);
    setSubmitError("");
    setDraftStatus("cleared");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleMultiTagToggle = (field: "sintomas", value: string) => {
    const current = sintomas || "";
    const selected = new Set(current ? current.split(", ") : []);
    if (selected.has(value)) {
      selected.delete(value);
    } else {
      selected.add(value);
    }
    setValue(field, Array.from(selected).join(", "), { shouldValidate: true });
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBF7F1] p-8 text-center">
        <Image
          src="/brand/bruna-flores-nutri-simbolo.webp"
          alt=""
          width={80}
          height={96}
          sizes="80px"
          className="mb-6 h-24 w-20 object-contain"
        />
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF0E4] text-[#607A56] shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="mb-4 font-serif text-4xl font-semibold text-[#3A3028]">
          Obrigada por compartilhar.
        </h2>
        <p className="mx-auto max-w-md text-lg leading-relaxed text-[#75675E]">
          Suas respostas foram enviadas com segurança. A Bruna vai analisar seu
          momento com cuidado antes do próximo contato.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para o site
        </Link>
      </div>
    );
  }

  // Fluxo dinâmico (IA configurada) — sem chooser, sem chat.
  if (dynamicActive && !intakePrefill) {
    return (
      <PreConsultationDynamic
        onFallback={(answers) => {
          setIntakePrefill(answers);
          setDynamicActive(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    );
  }

  // Resolvendo disponibilidade (config validada, sem chamada ao LLM).
  if (aiAvailability === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF7F1]">
        <p className="text-sm text-[#A9978A]">Preparando sua pré-consulta...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F1] text-[#3A3028]">
      <div className="sticky top-0 z-50 h-[4px] bg-[#EDE1D6]">
        <div 
          className="h-full bg-gradient-to-r from-[#7F9A74] via-[#BFD1B7] to-[#E8C5BD] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <header className="relative overflow-hidden border-b border-[#EDE1D6] bg-[#FFFDFC] px-5 py-8 lg:px-8">
        <div className="absolute inset-0 brand-texture opacity-35" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o site
          </Link>
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="brand-kicker mb-4">Pré-consulta</p>
              <h1 className="max-w-3xl font-serif text-5xl font-semibold leading-tight text-[#3A3028] md:text-6xl">
                Conte seu momento com calma.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#75675E]">
                Este formulário ajuda a Bruna a entender sua rotina, suas
                dúvidas e o que está difícil agora. Não precisa responder
                perfeito: responda como for possível.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FBF7F1] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)] lg:w-72">
              <div className="flex items-center gap-3 text-sm text-[#75675E]">
                <Clock3 className="h-5 w-5 text-[#7F9A74]" />
                Leva cerca de 10 minutos
              </div>
              <div className="mt-3 flex items-center gap-3 text-sm text-[#75675E]">
                <ShieldCheck className="h-5 w-5 text-[#7F9A74]" />
                Informações analisadas com cuidado
              </div>
              <div className="mt-3 flex items-center gap-3 text-sm text-[#75675E]">
                <HeartHandshake className="h-5 w-5 text-[#7F9A74]" />
                Sem julgamento, sem radicalismos
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#EDE1D6]">
                <div
                  className="h-full rounded-full bg-[#7F9A74] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-right text-xs font-semibold text-[#607A56]">
                {progress}% preenchido
              </p>
              <div className="mt-4 rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-3">
                <p className="text-xs leading-5 text-[#75675E]">
                  {draftStatus === "restored"
                    ? "Rascunho restaurado neste dispositivo."
                    : draftStatus === "saved"
                      ? "Rascunho salvo automaticamente."
                      : draftStatus === "cleared"
                        ? "Rascunho removido. Você pode recomeçar."
                        : "Suas respostas serão salvas automaticamente neste dispositivo."}
                </p>
                <button
                  type="button"
                  onClick={clearDraft}
                  className="mt-3 text-xs font-semibold text-[#8C5F50] underline underline-offset-4 transition hover:text-[#607A56]"
                >
                  Limpar e recomeçar
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 pb-24">
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8">

          {/* Tipo de atendimento */}
          <Section number="0" title="Tipo de atendimento">
            <Field label="Qual tipo de atendimento você procura?">
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  "Gestação",
                  "Pós-parto",
                  "Introdução alimentar",
                  "Infantil",
                  "TEA",
                  "Seletividade alimentar",
                  "Emagrecimento",
                  "Saúde intestinal",
                  "Bariátrico",
                  "Renal",
                  "Oncológico",
                  "Outro",
                ].map((tag) => (
                  <Tag
                    key={tag}
                    active={tipoAtendimento === tag}
                    onClick={() =>
                      setValue("tipoAtendimento", tag, { shouldValidate: true })
                    }
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            </Field>
          </Section>

          {/* Seção 1 */}
          <Section number="1" title="Sobre você">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <Field label="Nome completo" required error={errors.nome?.message}>
                <Input {...register("nome")} placeholder="Seu nome completo" />
              </Field>
              <Field label="Idade">
                <Input {...register("idade")} type="number" placeholder="Ex: 32" />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <Field label="Data de nascimento">
                <Input {...register("nascimento")} type="date" />
              </Field>
              <Field label="WhatsApp" required error={errors.whatsapp?.message}>
                <Input {...register("whatsapp")} type="tel" placeholder="(00) 00000-0000" />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <Field label="E-mail" required error={errors.email?.message}>
                <Input {...register("email")} type="email" placeholder="seu@email.com" />
              </Field>
              <Field label="Profissão">
                <Input {...register("profissao")} placeholder="Sua profissão" />
              </Field>
            </div>
            <Field label="Cidade / Estado">
              <Input {...register("cidade")} placeholder="Ex: Florianópolis, SC" />
            </Field>
          </Section>

          {/* Seção 2 */}
          {isPediatric && (
            <Section number="1.1" title="Dados da criança">
              <div className="mb-5 rounded-2xl border border-[#D9E4D3] bg-[#F4F8F1] px-4 py-3 text-sm leading-6 text-[#5F554D]">
                Preencha os dados da criança para que a avaliação considere fase de crescimento, rotina familiar e sinais alimentares importantes.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <Field label="Nome da criança" required error={errors.child_name?.message}>
                  <Input {...register("child_name")} placeholder="Nome da criança" />
                </Field>
                <Field label="Idade da criança" required error={errors.child_age?.message}>
                  <Input {...register("child_age")} placeholder="Ex: 2 anos e 4 meses" />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
                <Field label="Peso atual">
                  <Input {...register("child_weight_kg")} inputMode="decimal" placeholder="Ex: 13,5 kg" />
                </Field>
                <Field label="Estatura atual">
                  <Input {...register("child_height_cm")} inputMode="decimal" placeholder="Ex: 92 cm" />
                </Field>
                <Field label="Nascimento da criança">
                  <Input {...register("child_birth_date")} type="date" />
                </Field>
              </div>
              <Field label="Aleitamento / fórmula / mamadeiras" className="mb-5">
                <Textarea {...register("child_breastfeeding")} placeholder="Conte se mama no peito, usa fórmula, mamadeira, horários e aceitação." />
              </Field>
              <Field label="Repertório alimentar atual" className="mb-5">
                <Textarea {...register("child_food_repertoire")} placeholder="Alimentos aceitos, recusados, texturas, marcas, preparações e rotina das refeições." />
              </Field>
              <Field label="Dificuldades percebidas na alimentação" className="mb-5">
                <Textarea {...register("child_feeding_difficulties")} placeholder="Engasgos, seletividade, náuseas, recusa, preferências sensoriais, alergias ou outras observações." />
              </Field>
              <Field label="Rotina familiar, escola e cuidadores">
                <Textarea {...register("child_school_routine")} placeholder="Quem oferece as refeições, horários, escola/creche, lancheira e contexto familiar." />
              </Field>
            </Section>
          )}

          <Section number="2" title="Seu momento atual">
            <Field label="O que te motivou a buscar acompanhamento agora?" className="mb-5">
              <Textarea {...register("motivacao")} placeholder="Conte um pouco sobre o que te trouxe até aqui..." />
            </Field>
            <Field label="Qual seu principal objetivo?" className="mb-5">
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  "Mais segurança na alimentação",
                  "Introdução alimentar",
                  "Seletividade alimentar",
                  "Gestação/pós-parto",
                  "Saúde intestinal",
                  "Rotina mais leve",
                  "Outro",
                ].map((tag) => (
                  <Tag 
                    key={tag} 
                    active={objetivo === tag}
                    onClick={() => setValue("objetivo", tag, { shouldValidate: true })}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            </Field>
            <Field label="O que mais te incomoda hoje?">
              <Textarea {...register("incomodo")} placeholder="Descreva livremente..." />
            </Field>
          </Section>

          {/* Seção 3 */}
          <Section number="3" title="Histórico de saúde">
            <Field label="Possui algum diagnóstico? (Ex: SOP, diabetes...)" className="mb-5">
              <Input {...register("diagnostico")} placeholder="Se não, deixe em branco" />
            </Field>
            <Field label="Faz uso de medicação contínua? Qual?" className="mb-5">
              <Input {...register("medicacao")} placeholder="Nome dos medicamentos" />
            </Field>
            {isPregnancy && (
              <Field label="Sobre a gestação" className="mb-5">
                <Textarea {...register("gestational_details")} placeholder="Idade gestacional, data prevista para o parto, peso pré-gestacional, ganho de peso, náuseas, vômitos, constipação, azia..." />
              </Field>
            )}
            {isBariatric && (
              <Field label="Seu histórico bariátrico" className="mb-5">
                <Textarea {...register("bariatric_details")} placeholder="Quando foi a cirurgia, tipo e como está a suplementação e o acompanhamento." />
              </Field>
            )}
            {!isPediatric && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <Field label="Usa anticoncepcional?">
                  <RadioGroup
                    options={["Sim", "Não"]}
                    value={anticoncepcional}
                    onChange={(v) => setValue("anticoncepcional", v)}
                  />
                </Field>
                <Field label="Gestante ou amamentando?">
                  <RadioGroup
                    options={["Sim", "Não"]}
                    value={gestante}
                    onChange={(v) => setValue("gestante", v)}
                  />
                </Field>
              </div>
            )}
            <Field label={isPediatric ? "A criança apresenta com frequência: (marque vários)" : "Você apresenta com frequência: (marque vários)"}>
              <div className="flex flex-wrap gap-2 mt-2">
                {(isPediatric
                  ? ["Seletividade", "Recusa alimentar", "Engasgos", "Constipação", "Dor abdominal", "Alergias"]
                  : ["Cansaço", "Inchaço", "Queda de cabelo", "Ansiedade", "Compulsão", "Intestino preso"]
                ).map((tag) => (
                  <Tag 
                    key={tag} 
                    active={(sintomas || "").includes(tag)}
                    onClick={() => handleMultiTagToggle("sintomas", tag)}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            </Field>
          </Section>

          {/* Seção 4 */}
          <Section number="4" title="Suplementação">
            <Field label="Usa suplementos atualmente? Quais?" className="mb-5">
              <Input {...register("suplementos")} placeholder="Ex: whey, creatina, magnésio..." />
            </Field>
            <Field label="Já usou algo que não se adaptou?">
              <Input {...register("suplementosNegativo")} placeholder="Se não, deixe em branco" />
            </Field>
          </Section>

          {/* Seção 5 */}
          <Section number="5" title="Rotina e comportamento alimentar">
            <Field label={isPediatric ? "Como é a rotina diária da criança?" : "Como é sua rotina diária?"} className="mb-5">
              <Textarea
                {...register("rotina")}
                placeholder={isPediatric ? "Horários de escola, sono, cuidadores e refeições..." : "Horário que acorda, trabalha, dorme..."}
              />
            </Field>
            {!isPediatric && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <Field label="Fica muito tempo sem comer?">
                  <RadioGroup
                    options={["Sim", "Não", "Às vezes"]}
                    value={semComer}
                    onChange={(v) => setValue("semComer", v)}
                  />
                </Field>
                <Field label="Come mais por fome ou emoção?">
                  <RadioGroup
                    options={["Fome", "Emoção", "Os dois"]}
                    value={comerEmocao}
                    onChange={(v) => setValue("comerEmocao", v)}
                  />
                </Field>
              </div>
            )}
            <Field label={isPediatric ? "Como é o apetite e a aceitação ao longo do dia?" : "Como avalia sua fome ao longo do dia?"}>
              <Textarea
                {...register("fomeDia")}
                placeholder={isPediatric ? "Melhores horários, recusas, preferências e sinais de fome/saciedade..." : "Intensa de manhã, fraca à tarde..."}
              />
            </Field>
          </Section>

          {/* Seção 6 */}
          <Section number="6" title="Estilo de vida e Sono">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              <Field label="Horas de sono">
                <Input {...register("sonoHoras")} placeholder="Ex: 7h" />
              </Field>
              <Field label="Acorda descansada?" className="md:col-span-2">
                <RadioGroup 
                  options={["Sim", "Não", "Às vezes"]} 
                  value={descansada} 
                  onChange={(v) => setValue("descansada", v)} 
                />
              </Field>
            </div>
            <Field label="Nível de estresse" className="mb-5">
              <RadioGroup 
                options={["Baixo", "Moderado", "Alto"]} 
                value={estresse} 
                onChange={(v) => setValue("estresse", v)} 
              />
            </Field>
            <Field label="Pratica atividade física? Frequência?">
              <Textarea {...register("atividadeFisica")} placeholder="Ex: musculação 3x..." />
            </Field>
          </Section>

          {/* Seção 7 */}
          <Section number="7" title="Saúde intestinal">
            <Field label="Frequência intestinal" className="mb-5">
              <RadioGroup 
                options={["1x ou menos", "2-3x", "Todo dia", "Mais de 1x/dia"]} 
                value={intestinoFreq} 
                onChange={(v) => setValue("intestinoFreq", v)} 
              />
            </Field>
            <Field label="Sente estufamento/desconforto?">
              <RadioGroup 
                options={["Sempre", "Às vezes", "Raramente", "Não"]} 
                value={desconforto} 
                onChange={(v) => setValue("desconforto", v)} 
              />
            </Field>
          </Section>

          {/* Seção 8 */}
          <Section number="8" title="Preferências">
            <Field label="Alimentos que não gosta/tolera" className="mb-5">
              <Input {...register("naoGosta")} placeholder="Ex: glúten, frutos do mar..." />
            </Field>
            <Field label="Alimentos que não podem faltar">
              <Input {...register("favoritos")} placeholder="Ex: café, fruta, arroz..." />
            </Field>
          </Section>

          {/* Seção 9 */}
          <Section number="9" title="Sua rotina essencial">
            <Field label="Descreva um dia alimentar típico">
              <p className="text-xs text-[#A9978A] mb-2">Inclua horários e quantidades. Quanto mais detalhes, melhor.</p>
              <Textarea {...register("diaAlimentar")} className="min-h-[120px]" placeholder="Comece pelo café da manhã..." />
            </Field>
          </Section>

          {/* Seção 10 */}
          <Section number="10" title="Expectativas">
            <Field label="O que espera do acompanhamento?" className="mb-5">
              <Textarea {...register("expectativas")} placeholder="Conte suas expectativas..." />
            </Field>
            <Field label="De 0 a 10, disposta a mudar?">
              <div className="flex items-center gap-4 mt-2">
                <span className="text-xs text-[#A9978A]">0</span>
                <input 
                  type="range" 
                  min="0" max="10" 
                  className="flex-1 accent-[#C9937B] h-1.5 bg-[#EDE1D6] rounded-lg appearance-none cursor-pointer"
                  {...register("disposicao")} 
                />
                <span className="text-xs text-[#A9978A]">10</span>
                <span className="font-serif text-2xl text-[#75675E] w-8 text-center">{disposicao}</span>
              </div>
            </Field>
          </Section>

          {/* Seção 11 */}
          <Section number="11" title="Espaço livre">
            <Field label="Mais alguma coisa?">
              <Textarea {...register("espacoLivre")} placeholder="Espaço livre para compartilhar o que quiser..." />
            </Field>
          </Section>

          <div className="rounded-[1.35rem] border border-[#D9E4D3] bg-[#F4F8F1] p-6 md:p-7">
            <div className="flex items-start gap-3">
              <input
                id="privacyAccepted"
                type="checkbox"
                {...register("privacyAccepted")}
                className="mt-1 h-5 w-5 shrink-0 rounded border-[#BFD1B7] accent-[#607A56]"
              />
              <label htmlFor="privacyAccepted" className="text-sm leading-6 text-[#5F554D]">
                Li a <Link href="/privacidade" target="_blank" className="font-semibold text-[#607A56] underline underline-offset-4">Política de Privacidade</Link> e autorizo o uso dos dados informados para análise da pré-consulta, contato e atendimento nutricional. Sei que informações de saúde recebem proteção reforçada e que posso solicitar acesso, correção ou exclusão pelos canais indicados na política.
              </label>
            </div>
            {errors.privacyAccepted && (
              <p className="mt-3 text-sm text-red-600">{errors.privacyAccepted.message}</p>
            )}
          </div>

          <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label htmlFor="companyWebsite">Site da empresa</label>
            <input id="companyWebsite" tabIndex={-1} autoComplete="off" {...register("companyWebsite")} />
          </div>

          <div className="text-center pt-8">
            {submitError && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm leading-6 text-red-700">
                {submitError}
              </div>
            )}
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="rounded-full bg-[#7F9A74] px-12 py-4 font-sans text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_18px_42px_rgba(127,154,116,0.22)] transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Enviando..." : "Enviar pré-consulta"}
            </button>
          </div>

          <div className="text-center pt-10 border-t border-[#EDE1D6] mt-10">
            <p className="font-serif italic text-lg text-[#75675E]/80 leading-relaxed max-w-md mx-auto">
              A ideia é começar entendendo sua história para construir um plano
              possível, respeitoso e sustentável.
            </p>
          </div>

        </form>
      </div>

    </div>
  );
}

// Subcomponents

function Section({ number, title, children }: { number: string, title: string, children: React.ReactNode }) {
  return (
    <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)] transition-shadow hover:shadow-[0_24px_58px_rgba(58,48,40,0.08)] md:p-8">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#F5ECE4]">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EAF0E4] font-serif text-sm font-semibold text-[#607A56]">
          {number}
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">{title}</h2>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, required, error, className, children }: { label: string, required?: boolean, error?: string, className?: string, children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-2 block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#75675E]">
        {label} {required && <span className="text-[#8C5B70] ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <input 
    ref={ref}
    className="w-full rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-[#3A3028] placeholder-[#A9978A] transition-all focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12"
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => (
  <textarea 
    ref={ref}
    className="min-h-[90px] w-full resize-y rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-[#3A3028] placeholder-[#A9978A] transition-all focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12"
    {...props}
  />
));
Textarea.displayName = "Textarea";

function Tag({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm transition-all ${
        active 
          ? 'border-[#7F9A74] bg-[#7F9A74] text-white shadow-sm shadow-[#7F9A74]/15' 
          : 'border-[#EDE1D6] bg-[#F8F1EA] text-[#75675E] hover:border-[#7F9A74]/50 hover:bg-[#EAF0E4]'
      }`}
    >
      {children}
    </button>
  );
}

function RadioGroup({ options, value, onChange }: { options: string[], value?: string, onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((opt) => (
        <Tag key={opt} active={value === opt} onClick={() => onChange(opt)}>
          {opt}
        </Tag>
      ))}
    </div>
  );
}
