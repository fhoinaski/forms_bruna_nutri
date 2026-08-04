"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormResponseSchema, FormResponseInput } from "@/validators/form";
import { useState, useEffect } from "react";
import React from "react";
import { ArrowLeft, CheckCircle2, Clock3, HeartHandshake, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function FormularioPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState(0);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormResponseInput>({
    resolver: zodResolver(FormResponseSchema),
    defaultValues: {
      tipoAtendimento: "",
      objetivo: "",
      sintomas: "",
      anticoncepcional: undefined,
      gestante: undefined,
      semComer: undefined,
      comerEmocao: undefined,
      descansada: undefined,
      estresse: undefined,
      intestinoFreq: undefined,
      desconforto: undefined,
      disposicao: "5",
    }
  });

  const watchAllFields = watch();

  useEffect(() => {
    // Calculando progresso simples baseado no total de campos (aprox. 30 chaves)
    const values = Object.values(watchAllFields);
    const filledCount = values.filter(v => v !== undefined && v !== "").length;
    const totalFields = 32;
    setProgress(Math.min(100, Math.round((filledCount / totalFields) * 100)));
  }, [watchAllFields]);

  const onSubmit = async (data: FormResponseInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao enviar resposta");
      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      alert("Ocorreu um erro ao enviar. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMultiTagToggle = (field: "sintomas", value: string) => {
    const current = watchAllFields[field] || "";
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
        <img
          src="/brand/bruna-flores-nutri-simbolo.svg"
          alt=""
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
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 pb-24">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

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
                  "Outro",
                ].map((tag) => (
                  <Tag
                    key={tag}
                    active={watchAllFields.tipoAtendimento === tag}
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
                    active={watchAllFields.objetivo === tag}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <Field label="Usa anticoncepcional?">
                <RadioGroup 
                  options={["Sim", "Não"]} 
                  value={watchAllFields.anticoncepcional} 
                  onChange={(v) => setValue("anticoncepcional", v)} 
                />
              </Field>
              <Field label="Gestante ou amamentando?">
                <RadioGroup 
                  options={["Sim", "Não"]} 
                  value={watchAllFields.gestante} 
                  onChange={(v) => setValue("gestante", v)} 
                />
              </Field>
            </div>
            <Field label="Você apresenta com frequência: (marque vários)">
              <div className="flex flex-wrap gap-2 mt-2">
                {["Cansaço", "Inchaço", "Queda de cabelo", "Ansiedade", "Compulsão", "Intestino preso"].map((tag) => (
                  <Tag 
                    key={tag} 
                    active={(watchAllFields.sintomas || "").includes(tag)}
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
            <Field label="Como é sua rotina diária?" className="mb-5">
              <Textarea {...register("rotina")} placeholder="Horário que acorda, trabalha, dorme..." />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <Field label="Fica muito tempo sem comer?">
                <RadioGroup 
                  options={["Sim", "Não", "Às vezes"]} 
                  value={watchAllFields.semComer} 
                  onChange={(v) => setValue("semComer", v)} 
                />
              </Field>
              <Field label="Come mais por fome ou emoção?">
                <RadioGroup 
                  options={["Fome", "Emoção", "Os dois"]} 
                  value={watchAllFields.comerEmocao} 
                  onChange={(v) => setValue("comerEmocao", v)} 
                />
              </Field>
            </div>
            <Field label="Como avalia sua fome ao longo do dia?">
              <Textarea {...register("fomeDia")} placeholder="Intensa de manhã, fraca à tarde..." />
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
                  value={watchAllFields.descansada} 
                  onChange={(v) => setValue("descansada", v)} 
                />
              </Field>
            </div>
            <Field label="Nível de estresse" className="mb-5">
              <RadioGroup 
                options={["Baixo", "Moderado", "Alto"]} 
                value={watchAllFields.estresse} 
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
                value={watchAllFields.intestinoFreq} 
                onChange={(v) => setValue("intestinoFreq", v)} 
              />
            </Field>
            <Field label="Sente estufamento/desconforto?">
              <RadioGroup 
                options={["Sempre", "Às vezes", "Raramente", "Não"]} 
                value={watchAllFields.desconforto} 
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
                <span className="font-serif text-2xl text-[#75675E] w-8 text-center">{watchAllFields.disposicao}</span>
              </div>
            </Field>
          </Section>

          {/* Seção 11 */}
          <Section number="11" title="Espaço livre">
            <Field label="Mais alguma coisa?">
              <Textarea {...register("espacoLivre")} placeholder="Espaço livre para compartilhar o que quiser..." />
            </Field>
          </Section>

          <div className="text-center pt-8">
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
