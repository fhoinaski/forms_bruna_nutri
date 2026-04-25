"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormResponseSchema, FormResponseInput } from "@/validators/form";
import { useState, useEffect } from "react";
import React from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-[#FAF7F2]">
        <div className="w-16 h-16 rounded-full bg-[#EAD8C2] flex items-center justify-center text-[#7A9A74] mb-6 shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-4xl mb-4 text-[#B47F6A] font-light">Obrigada por compartilhar!</h2>
        <p className="text-[#8C6E52] max-w-md mx-auto text-lg leading-relaxed">
          Suas respostas foram enviadas com sucesso. Em breve entrarei em contato para confirmar sua consulta.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-50 h-[4px] bg-[#EAD8C2]">
        <div 
          className="h-full bg-gradient-to-r from-[#B47F6A] to-[#F4C9C6] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="bg-[#7A9A74] px-6 pt-16 pb-14 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        <div className="text-[#F4C9C6] text-xs font-semibold tracking-widest uppercase mb-4 relative z-10">
          Nutrição Personalizada
        </div>
        <h1 className="font-serif text-5xl md:text-6xl text-[#FAF7F2] font-light leading-tight relative z-10">
          Formulário<br/><em className="text-[#EAD8C2] italic">Pré-Consulta</em>
        </h1>
        <p className="text-[#FAF7F2]/80 mt-5 max-w-md mx-auto text-sm leading-relaxed relative z-10">
          Quanto mais você compartilhar, mais assertivo será seu plano alimentar. Leva cerca de 10 minutos.
        </p>
        <div className="w-10 h-[1px] bg-[#EAD8C2]/50 mx-auto mt-8 relative z-10" />
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10 pb-24">
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
                {["Emagrecimento", "Ganho muscular", "Saúde intestinal", "Gestação/pós-parto", "Saúde capilar", "Outro"].map((tag) => (
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
              <p className="text-xs text-[#A8927D] mb-2">Inclua horários e quantidades. Quanto mais detalhes, melhor.</p>
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
                <span className="text-xs text-[#A8927D]">0</span>
                <input 
                  type="range" 
                  min="0" max="10" 
                  className="flex-1 accent-[#B47F6A] h-1.5 bg-[#EAD8C2] rounded-lg appearance-none cursor-pointer"
                  {...register("disposicao")} 
                />
                <span className="text-xs text-[#A8927D]">10</span>
                <span className="font-serif text-2xl text-[#8C6E52] w-8 text-center">{watchAllFields.disposicao}</span>
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
              className="font-sans font-medium text-sm tracking-[0.12em] uppercase text-white bg-[#B47F6A] hover:bg-[#8C6E52] transition-colors rounded-full px-12 py-4 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-[#B47F6A]/20"
            >
              {isSubmitting ? "Enviando..." : "Enviar formulário"}
            </button>
          </div>

          <div className="text-center pt-10 border-t border-[#EAD8C2] mt-10">
            <p className="font-serif italic text-lg text-[#8C6E52]/80 leading-relaxed max-w-md mx-auto">
              Meu objetivo é te ajudar de forma realista, respeitando sua rotina — sem radicalismos.<br/>
              Vamos construir juntas um plano possível e sustentável.
            </p>
          </div>

        </form>
      </div>

    </>
  );
}

// Subcomponents

function Section({ number, title, children }: { number: string, title: string, children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8D9C8] rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#F2EBE0]">
        <div className="w-8 h-8 rounded-full bg-[#7A9A74] text-white font-serif flex items-center justify-center text-sm">
          {number}
        </div>
        <h2 className="font-serif text-2xl text-[#8C6E52]">{title}</h2>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, required, error, className, children }: { label: string, required?: boolean, error?: string, className?: string, children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-[0.8rem] tracking-wider uppercase text-[#7A6050] mb-2 font-medium">
        {label} {required && <span className="text-[#B47F6A] ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <input 
    ref={ref}
    className="w-full bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl px-4 py-3 text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#B47F6A] focus:ring-1 focus:ring-[#B47F6A] transition-all"
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => (
  <textarea 
    ref={ref}
    className="w-full bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl px-4 py-3 text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#B47F6A] focus:ring-1 focus:ring-[#B47F6A] transition-all min-h-[90px] resize-y"
    {...props}
  />
));
Textarea.displayName = "Textarea";

function Tag({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-4 py-2 rounded-full border transition-all ${
        active 
          ? 'bg-[#7A9A74] border-[#7A9A74] text-white shadow-sm' 
          : 'bg-[#F2EBE0] border-[#E8D9C8] text-[#7A6050] hover:border-[#8C6E52]'
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
