"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  calculateWaistHeightRatio,
  calculateWaistHipRatio,
  classifyAdultBmi,
  classifyWaistHeightRatio,
  classifyWaistHipRatio,
} from "@/lib/clinical/anthropometry";
import { calculateBodyComposition, type SkinfoldValuesMm } from "@/lib/clinical/body-composition";

/**
 * Extraido de app/dashboard/clients/[id]/page.tsx (era uma funcao inline
 * num arquivo de 2200+ linhas) para ser reaproveitado tanto pela aba
 * Antropometria existente quanto pelo Modo Consulta
 * (components/consultation/ConsultationAnthropometry.tsx) — mesmo
 * formulario, mesmos calculos, sem duplicar logica clinica.
 */
export function ClinicalEvolutionForm({ clientId, onSuccess, biologicalSex, ageYears }: {
  clientId: string; onSuccess: () => void; biologicalSex: string | null; ageYears: number | null;
}) {
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [hipCm, setHipCm] = useState("");
  const [armCm, setArmCm] = useState("");
  const [abdomenCm, setAbdomenCm] = useState("");
  const [thighCm, setThighCm] = useState("");
  const [skinfoldTriceps, setSkinfoldTriceps] = useState("");
  const [skinfoldSubscapular, setSkinfoldSubscapular] = useState("");
  const [skinfoldChest, setSkinfoldChest] = useState("");
  const [skinfoldMidaxillary, setSkinfoldMidaxillary] = useState("");
  const [skinfoldSuprailiac, setSkinfoldSuprailiac] = useState("");
  const [skinfoldAbdominal, setSkinfoldAbdominal] = useState("");
  const [skinfoldThigh, setSkinfoldThigh] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [energyLevel, setEnergyLevel] = useState("");
  const [appetite, setAppetite] = useState("");
  const [bowelPattern, setBowelPattern] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [adherenceNotes, setAdherenceNotes] = useState("");
  const [adherenceScore, setAdherenceScore] = useState("");
  const [progressNotes, setProgressNotes] = useState("");
  const [conductNotes, setConductNotes] = useState("");
  const [clinicalImpression, setClinicalImpression] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const skinfoldValuesMm: SkinfoldValuesMm = {
    triceps: skinfoldTriceps ? Number(skinfoldTriceps) : null,
    subscapular: skinfoldSubscapular ? Number(skinfoldSubscapular) : null,
    chest: skinfoldChest ? Number(skinfoldChest) : null,
    midaxillary: skinfoldMidaxillary ? Number(skinfoldMidaxillary) : null,
    suprailiac: skinfoldSuprailiac ? Number(skinfoldSuprailiac) : null,
    abdominal: skinfoldAbdominal ? Number(skinfoldAbdominal) : null,
    thigh: skinfoldThigh ? Number(skinfoldThigh) : null,
  };
  const hasAnySkinfold = Object.values(skinfoldValuesMm).some((value) => value !== null);
  const bodyComposition = useMemo(
    () => calculateBodyComposition({ weightKg: weight ? Number(weight) : null, ageYears, sex: biologicalSex, skinfolds: skinfoldValuesMm }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weight, ageYears, biologicalSex, skinfoldTriceps, skinfoldSubscapular, skinfoldChest, skinfoldMidaxillary, skinfoldSuprailiac, skinfoldAbdominal, skinfoldThigh]
  );

  const resetForm = () => {
    setMeasuredAt(new Date().toISOString().slice(0, 10));
    setWeight(""); setHeight(""); setWaistCm(""); setHipCm(""); setArmCm(""); setAbdomenCm(""); setThighCm("");
    setSkinfoldTriceps(""); setSkinfoldSubscapular(""); setSkinfoldChest(""); setSkinfoldMidaxillary("");
    setSkinfoldSuprailiac(""); setSkinfoldAbdominal(""); setSkinfoldThigh("");
    setBloodPressure(""); setEnergyLevel(""); setAppetite(""); setBowelPattern(""); setSleepQuality("");
    setSymptoms(""); setAdherenceNotes(""); setAdherenceScore(""); setProgressNotes("");
    setConductNotes(""); setClinicalImpression(""); setNextSteps("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/evolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measured_at: measuredAt ? new Date(`${measuredAt}T12:00:00`).toISOString() : null,
          weight: weight ? Number(weight) : null,
          height: height ? Number(height) : null,
          waist_cm: waistCm ? Number(waistCm) : null,
          hip_cm: hipCm ? Number(hipCm) : null,
          arm_cm: armCm ? Number(armCm) : null,
          abdomen_cm: abdomenCm ? Number(abdomenCm) : null,
          thigh_cm: thighCm ? Number(thighCm) : null,
          body_fat_percentage: bodyComposition ? Number(bodyComposition.bodyFatPercentage.toFixed(1)) : null,
          skinfold_triceps_mm: skinfoldValuesMm.triceps,
          skinfold_subscapular_mm: skinfoldValuesMm.subscapular,
          skinfold_chest_mm: skinfoldValuesMm.chest,
          skinfold_midaxillary_mm: skinfoldValuesMm.midaxillary,
          skinfold_suprailiac_mm: skinfoldValuesMm.suprailiac,
          skinfold_abdominal_mm: skinfoldValuesMm.abdominal,
          skinfold_thigh_mm: skinfoldValuesMm.thigh,
          blood_pressure: bloodPressure || null,
          energy_level: energyLevel ? Number(energyLevel) : null,
          appetite: appetite || null,
          bowel_pattern: bowelPattern || null,
          sleep_quality: sleepQuality || null,
          symptoms: symptoms || null,
          adherence_notes: adherenceNotes || null,
          adherence_score: adherenceScore ? Number(adherenceScore) : null,
          progress_notes: progressNotes || null,
          conduct_notes: conductNotes || null,
          clinical_impression: clinicalImpression || null,
          next_steps: nextSteps || null,
        }),
      });
      if (!response.ok) throw new Error();
      resetForm();
      onSuccess();
    } catch {
      setError("Nao foi possivel registrar a evolucao clinica.");
    } finally {
      setSaving(false);
    }
  };

  const bmiPreview = weight && height ? (Number(weight) / Math.pow(Number(height) / 100, 2)).toFixed(1) : null;
  const sexDefined = biologicalSex === "Masculino" || biologicalSex === "Feminino";
  const waistHipRatio = calculateWaistHipRatio(waistCm, hipCm);
  const waistHeightRatio = calculateWaistHeightRatio(waistCm, height);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/60 p-5">
      <div>
        <h3 className="font-serif text-lg font-semibold text-[#B47F6A]">Nova evolucao clinica</h3>
        <p className="mt-1 text-xs leading-5 text-[#8C6E52]">Registre medidas, sinais da rotina e conduta para acompanhar a linha do tempo nutricional.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div><label className="brand-label">Data da avaliacao</label><input type="date" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} className="brand-input" /></div>
        <div><label className="brand-label">Peso (kg)</label><input type="number" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="Ex: 68.5" className="brand-input" /></div>
        <div><label className="brand-label">Altura (cm)</label><input type="number" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="Ex: 165" className="brand-input" /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <div><label className="brand-label">Cintura (cm)</label><input type="number" step="0.1" value={waistCm} onChange={(event) => setWaistCm(event.target.value)} placeholder="Ex: 82" className="brand-input" /></div>
        <div><label className="brand-label">Quadril (cm)</label><input type="number" step="0.1" value={hipCm} onChange={(event) => setHipCm(event.target.value)} placeholder="Ex: 98" className="brand-input" /></div>
        <div><label className="brand-label">Braco (cm)</label><input type="number" step="0.1" value={armCm} onChange={(event) => setArmCm(event.target.value)} placeholder="Ex: 29" className="brand-input" /></div>
        <div><label className="brand-label">Abdomen (cm)</label><input type="number" step="0.1" value={abdomenCm} onChange={(event) => setAbdomenCm(event.target.value)} placeholder="Ex: 90" className="brand-input" /></div>
        <div><label className="brand-label">Coxa (cm)</label><input type="number" step="0.1" value={thighCm} onChange={(event) => setThighCm(event.target.value)} placeholder="Ex: 58" className="brand-input" /></div>
      </div>

      <div className="rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-4">
        <h4 className="font-serif text-base font-semibold text-[#3A3028]">Dobras cutaneas (protocolo Jackson &amp; Pollock, 7 dobras)</h4>
        <p className="mt-1 text-xs leading-5 text-[#8C6E52]">Valores em milimetros. Preencha as 7 para o sistema calcular densidade corporal, % de gordura, massa gorda e massa magra automaticamente.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label className="brand-label">Triceps</label><input type="number" step="0.1" value={skinfoldTriceps} onChange={(event) => setSkinfoldTriceps(event.target.value)} placeholder="Ex: 20" className="brand-input" /></div>
          <div><label className="brand-label">Subescapular</label><input type="number" step="0.1" value={skinfoldSubscapular} onChange={(event) => setSkinfoldSubscapular(event.target.value)} placeholder="Ex: 18" className="brand-input" /></div>
          <div><label className="brand-label">Peitoral</label><input type="number" step="0.1" value={skinfoldChest} onChange={(event) => setSkinfoldChest(event.target.value)} placeholder="Ex: 15" className="brand-input" /></div>
          <div><label className="brand-label">Axilar media</label><input type="number" step="0.1" value={skinfoldMidaxillary} onChange={(event) => setSkinfoldMidaxillary(event.target.value)} placeholder="Ex: 17" className="brand-input" /></div>
          <div><label className="brand-label">Supra-iliaca</label><input type="number" step="0.1" value={skinfoldSuprailiac} onChange={(event) => setSkinfoldSuprailiac(event.target.value)} placeholder="Ex: 22" className="brand-input" /></div>
          <div><label className="brand-label">Abdominal</label><input type="number" step="0.1" value={skinfoldAbdominal} onChange={(event) => setSkinfoldAbdominal(event.target.value)} placeholder="Ex: 25" className="brand-input" /></div>
          <div><label className="brand-label">Coxa</label><input type="number" step="0.1" value={skinfoldThigh} onChange={(event) => setSkinfoldThigh(event.target.value)} placeholder="Ex: 23" className="brand-input" /></div>
        </div>

        {!sexDefined && hasAnySkinfold && (
          <p className="mt-4 text-xs font-medium text-[#B47F6A]">
            Defina o sexo biologico na Anamnese para calcular a composicao corporal por dobras cutaneas.
          </p>
        )}
        {sexDefined && ageYears === null && hasAnySkinfold && (
          <p className="mt-4 text-xs font-medium text-[#B47F6A]">
            Cadastre a data de nascimento do paciente para calcular a composicao corporal por dobras cutaneas.
          </p>
        )}
      </div>

      {(bmiPreview || bodyComposition || waistHipRatio !== null || waistHeightRatio !== null) && (
        <div className="rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] p-4">
          <h4 className="font-serif text-base font-semibold text-[#4F6847]">Indicadores calculados</h4>
          <p className="mt-1 text-xs leading-5 text-[#607A56]">Calculados automaticamente a partir das medidas informadas acima — mude as medidas para atualizar.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {bmiPreview && (
              <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">IMC</p><p className="text-sm font-semibold text-[#3A3028]">{bmiPreview}</p><p className="mt-1 text-xs leading-5 text-[#75675E]">{classifyAdultBmi(bmiPreview) ?? "Sem classificação"}</p></div>
            )}
            {waistHipRatio !== null && (
              <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">RCQ (cintura/quadril)</p><p className="text-sm font-semibold text-[#3A3028]">{waistHipRatio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="mt-1 text-xs leading-5 text-[#75675E]">{classifyWaistHipRatio(waistHipRatio, biologicalSex)}</p></div>
            )}
            {waistHeightRatio !== null && (
              <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">RCE (cintura/estatura)</p><p className="text-sm font-semibold text-[#3A3028]">{waistHeightRatio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="mt-1 text-xs leading-5 text-[#75675E]">{classifyWaistHeightRatio(waistHeightRatio)}</p></div>
            )}
            {bodyComposition && (
              <>
                <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">Gordura corporal</p><p className="text-sm font-semibold text-[#3A3028]">{bodyComposition.bodyFatPercentage.toFixed(1)}%</p></div>
                <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">Soma das dobras</p><p className="text-sm font-semibold text-[#3A3028]">{bodyComposition.sumSkinfoldsMm.toFixed(0)} mm</p></div>
                <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">Densidade corporal</p><p className="text-sm font-semibold text-[#3A3028]">{bodyComposition.bodyDensity.toFixed(4)} g/ml</p></div>
                <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">Massa gorda</p><p className="text-sm font-semibold text-[#3A3028]">{bodyComposition.fatMassKg.toFixed(1)} kg</p></div>
                <div className="rounded-lg bg-white p-3"><p className="brand-label mb-1">Massa livre de gordura</p><p className="text-sm font-semibold text-[#3A3028]">{bodyComposition.leanMassKg.toFixed(1)} kg</p></div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div><label className="brand-label">Pressao arterial</label><input value={bloodPressure} onChange={(event) => setBloodPressure(event.target.value)} placeholder="Ex: 110/70" className="brand-input" /></div>
        <div><label className="brand-label">Energia</label><select value={energyLevel} onChange={(event) => setEnergyLevel(event.target.value)} className="brand-input"><option value="">Selecione</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></div>
        <div><label className="brand-label">Apetite</label><input value={appetite} onChange={(event) => setAppetite(event.target.value)} placeholder="Preservado, baixo..." className="brand-input" /></div>
        <div><label className="brand-label">Intestino</label><input value={bowelPattern} onChange={(event) => setBowelPattern(event.target.value)} placeholder="Regular, constipado..." className="brand-input" /></div>
        <div><label className="brand-label">Sono</label><input value={sleepQuality} onChange={(event) => setSleepQuality(event.target.value)} placeholder="Bom, fragmentado..." className="brand-input" /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div><label className="brand-label">Sintomas e sinais atuais</label><textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} rows={3} className="brand-input resize-y" placeholder="Queixas, sintomas, tolerancia alimentar e sinais observados." /></div>
        <div>
          <label className="brand-label">Adesao ao plano</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <select value={adherenceScore} onChange={(event) => setAdherenceScore(event.target.value)} className="brand-input"><option value="">Escore</option>{Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value}/10</option>)}</select>
            <textarea value={adherenceNotes} onChange={(event) => setAdherenceNotes(event.target.value)} rows={3} className="brand-input resize-y" placeholder="Facilitadores, barreiras e combinados da rotina." />
          </div>
        </div>
        <div><label className="brand-label">Progressos observados</label><textarea value={progressNotes} onChange={(event) => setProgressNotes(event.target.value)} rows={3} className="brand-input resize-y" placeholder="Mudancas clinicas, alimentares, comportamentais e familiares." /></div>
        <div><label className="brand-label">Impressao clinica</label><textarea value={clinicalImpression} onChange={(event) => setClinicalImpression(event.target.value)} rows={3} className="brand-input resize-y" placeholder="Interpretacao profissional, pontos de alerta e prioridade." /></div>
        <div><label className="brand-label">Conduta adotada</label><textarea value={conductNotes} onChange={(event) => setConductNotes(event.target.value)} rows={3} className="brand-input resize-y" placeholder="Ajustes, orientacoes e materiais enviados." /></div>
        <div><label className="brand-label">Proximos passos</label><textarea value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} rows={3} className="brand-input resize-y" placeholder="Metas ate o proximo encontro e sinais para monitorar." /></div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="brand-btn-primary"><Plus className="h-4 w-4" />{saving ? "Registrando..." : "Registrar evolucao"}</button>
    </form>
  );
}
