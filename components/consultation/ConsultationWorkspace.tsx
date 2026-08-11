"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsultationHeader, type ConsultationHeaderAlerts, type ConsultationHeaderClient } from "@/components/consultation/ConsultationHeader";
import { ConsultationBrief } from "@/components/consultation/ConsultationBrief";
import { ConsultationNotes } from "@/components/consultation/ConsultationNotes";
import { ConsultationRecordSummary, type ConsultationRecordFields } from "@/components/consultation/ConsultationRecordSummary";
import { ConsultationAnthropometry } from "@/components/consultation/ConsultationAnthropometry";
import { ConsultationEvolution } from "@/components/consultation/ConsultationEvolution";
import { ConsultationMealPlan } from "@/components/consultation/ConsultationMealPlan";
import { ConsultationProtocol } from "@/components/consultation/ConsultationProtocol";
import { ConsultationExams } from "@/components/consultation/ConsultationExams";
import { ConsultationCopilot } from "@/components/consultation/ConsultationCopilot";
import { ConsultationFinishDialog } from "@/components/consultation/ConsultationFinishDialog";

interface ConsultationSessionDto {
  id: string;
  client_id: string;
  status: "in_progress" | "completed" | "cancelled";
  started_at: string;
  notes: string | null;
  ai_brief: unknown | null;
}

const TABS = [
  { id: "consulta", label: "Consulta" },
  { id: "antropometria", label: "Antropometria" },
  { id: "evolucao", label: "Evolução" },
  { id: "plano", label: "Plano" },
  { id: "protocolo", label: "Protocolo" },
  { id: "exames", label: "Exames" },
];

/**
 * Workspace clinico unico do Modo Consulta (FASE 1) — orquestra as tres
 * areas conceituais do pedido: cabecalho/alertas (Area A, dentro de
 * ConsultationHeader), consulta/anamnese/antropometria/plano/protocolo
 * (Area B, abas abaixo) e o Copiloto (Area C, painel lateral).
 */
export function ConsultationWorkspace({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<ConsultationSessionDto | null>(null);
  const [client, setClient] = useState<ConsultationHeaderClient | null>(null);
  const [alerts, setAlerts] = useState<ConsultationHeaderAlerts | null>(null);
  const [examsText, setExamsText] = useState<string | null>(null);
  const [recordFields, setRecordFields] = useState<ConsultationRecordFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("consulta");
  const [showFinish, setShowFinish] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pendingCopilotMessage, setPendingCopilotMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadAll() {
    setLoading(true);
    const [sessionRes, clientRes, recordRes, growthRes] = await Promise.all([
      fetch(`/api/admin/clients/${clientId}/consultation`, { cache: "no-store" }),
      fetch(`/api/admin/clients/${clientId}`, { cache: "no-store" }),
      fetch(`/api/admin/clients/${clientId}/nutrition-record`, { cache: "no-store" }),
      fetch(`/api/admin/clients/${clientId}/clinical-growth`, { cache: "no-store" }),
    ]);
    if (sessionRes.ok) {
      const data = await sessionRes.json();
      setSession(data.session);
    }
    if (clientRes.ok) setClient(await clientRes.json());
    if (recordRes.ok) {
      const record = await recordRes.json();
      setExamsText(record?.exams ?? null);
      setRecordFields(record ?? null);
      if (growthRes.ok) {
        const growth = await growthRes.json();
        setAlerts({
          allergies: record?.allergies ?? null,
          restrictions: record?.restrictions ?? null,
          medications: record?.medications ?? null,
          diagnoses: record?.diagnoses ?? null,
          risk_flags: record?.risk_flags ?? null,
          biological_sex: record?.biological_sex ?? null,
          target_group: record?.target_group ?? null,
          gestationalApplicable: Boolean(growth?.gestational?.applicable),
          bariatricApplicable: Boolean(growth?.bariatric?.applicable),
        });
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshKey]);

  async function startSession() {
    const response = await fetch(`/api/admin/clients/${clientId}/consultation`, { method: "POST" });
    if (response.ok) {
      const data = await response.json();
      setSession(data.session);
    }
  }

  function handleProposalConfirmed() {
    setRefreshKey((value) => value + 1);
  }

  if (loading) return <p className="p-6 text-sm text-[#75675E]">Carregando...</p>;

  if (finished) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[#D9E4D3] bg-[#F4F8F1] p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-[#607A56]" />
        <p className="font-serif text-lg font-semibold text-[#3A3028]">Consulta finalizada</p>
        <button type="button" onClick={() => router.push(`/dashboard/clients/${clientId}`)} className="brand-btn-primary">Voltar para a ficha</button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[#EDE1D6] bg-white p-8 text-center">
        <p className="text-sm text-[#75675E]">Nenhuma consulta em andamento para este paciente.</p>
        <button type="button" onClick={() => void startSession()} className="brand-btn-primary">Iniciar consulta</button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {client && (
          <ConsultationHeader
            client={client}
            alerts={alerts}
            startedAt={session.started_at}
          />
        )}

        <div className="flex justify-end">
          <button type="button" onClick={() => setShowFinish(true)} className="brand-btn-primary">Finalizar consulta</button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            {TABS.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="consulta" className="space-y-4">
            <ConsultationBrief consultationSessionId={session.id} initialBrief={session.ai_brief} />
            <ConsultationNotes
              consultationSessionId={session.id}
              initialNotes={session.notes ?? ""}
              onOrganizeWithAI={(notes) => setPendingCopilotMessage(`Organize estas notas da consulta e proponha a atualização do prontuário: ${notes}`)}
            />
            <ConsultationRecordSummary clientId={clientId} record={recordFields} />
          </TabsContent>
          <TabsContent value="antropometria">
            <ConsultationAnthropometry clientId={clientId} birthDate={client?.birth_date ?? null} biologicalSex={alerts?.biological_sex ?? null} />
          </TabsContent>
          <TabsContent value="evolucao">
            <ConsultationEvolution clientId={clientId} />
          </TabsContent>
          <TabsContent value="plano">
            <ConsultationMealPlan clientId={clientId} />
          </TabsContent>
          <TabsContent value="protocolo">
            <ConsultationProtocol clientId={clientId} />
          </TabsContent>
          <TabsContent value="exames">
            <ConsultationExams examsText={examsText} onAskCopilotToSummarize={() => setPendingCopilotMessage("Resuma os exames registrados no prontuário deste paciente.")} />
          </TabsContent>
        </Tabs>
      </div>

      <div className="h-[calc(100vh-140px)] xl:sticky xl:top-4">
        <ConsultationCopilot
          clientId={clientId}
          consultationSessionId={session.id}
          externalMessage={pendingCopilotMessage}
          onExternalMessageSent={() => setPendingCopilotMessage(null)}
          onProposalConfirmed={handleProposalConfirmed}
        />
      </div>

      {showFinish && (
        <ConsultationFinishDialog
          consultationSessionId={session.id}
          clientId={clientId}
          onClose={() => setShowFinish(false)}
          onFinished={() => {
            setShowFinish(false);
            setFinished(true);
          }}
        />
      )}
    </div>
  );
}
