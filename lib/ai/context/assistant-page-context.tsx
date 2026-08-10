"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * O que o frontend sabe sobre "onde a nutricionista esta" — so
 * identificadores, nunca dados clinicos (secao 2 do pedido de UX). O backend
 * (lib/ai/core/ai-context.ts) resolve o que for necessario a partir destes
 * ids atraves das tools; o contexto aqui NUNCA e tratado como autorizacao —
 * so um atalho para nao precisar reescrever "a paciente Maria Silva" toda
 * hora (secao 3).
 *
 * `currentPage` usa o mesmo vocabulario de `NavigationDestination`
 * (lib/ai/agents/navigation/navigation-agent.ts) onde aplicavel, para as
 * duas pontas (frontend e prompt) falarem a mesma lingua.
 */
export interface AssistantPageContext {
  currentPage: string;
  clientId?: string;
  submissionId?: string;
  protocolId?: string;
  appointmentId?: string;
  recipeId?: string;
}

/**
 * Deriva o contexto BASE a partir do pathname — puro, sem hooks, para poder
 * ser testado sem DOM. Cobre as telas reais mapeadas na auditoria de UI;
 * rotas nao mapeadas caem em "other" (nunca inventa contexto que a pagina
 * nao tem).
 */
export function resolveBasePageContext(pathname: string): AssistantPageContext {
  const clientDetail = pathname.match(/^\/dashboard\/clients\/([^/]+)$/);
  if (clientDetail) return { currentPage: "client_record", clientId: clientDetail[1] };

  const submissionDetail = pathname.match(/^\/dashboard\/submissions\/([^/]+)$/);
  if (submissionDetail) return { currentPage: "submission_detail", submissionId: submissionDetail[1] };

  const protocolDetail = pathname.match(/^\/dashboard\/protocols\/([^/]+)$/);
  if (protocolDetail) return { currentPage: "protocol_detail", protocolId: protocolDetail[1] };

  if (pathname === "/dashboard") return { currentPage: "dashboard" };
  if (pathname === "/dashboard/clients") return { currentPage: "clients_list" };
  if (pathname === "/dashboard/agenda") return { currentPage: "agenda" };
  if (pathname === "/dashboard/protocols") return { currentPage: "protocols_library" };
  if (pathname === "/dashboard/templates/receitas") return { currentPage: "recipes_library" };
  if (pathname === "/dashboard/templates") return { currentPage: "templates_library" };
  if (pathname === "/dashboard/oportunidades") return { currentPage: "opportunities" };
  if (pathname === "/dashboard/financeiro") return { currentPage: "financeiro" };
  if (pathname === "/dashboard/tarefas") return { currentPage: "tasks" };

  return { currentPage: "other" };
}

type ExtraContext = Partial<Omit<AssistantPageContext, "currentPage">>;

interface AssistantPageContextValue {
  context: AssistantPageContext;
  /**
   * Para uma pagina publicar um identificador local que o pathname sozinho
   * nao carrega (ex.: appointmentId da consulta selecionada na agenda).
   * Limpo automaticamente na troca de rota — nunca sobrevive a navegacao.
   */
  setExtra: (extra: ExtraContext) => void;
}

const Ctx = createContext<AssistantPageContextValue | null>(null);

export function AssistantPageContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const base = useMemo(() => resolveBasePageContext(pathname), [pathname]);
  const [extra, setExtraState] = useState<ExtraContext>({});

  // Contexto extra (ex.: appointmentId selecionado) nunca sobrevive a uma
  // troca de rota — evita que "a consulta que eu tinha selecionado na
  // agenda" vaze para outra tela (secao 4 do pedido: limpeza de contexto).
  useEffect(() => {
    setExtraState({});
  }, [pathname]);

  const setExtra = useCallback((next: ExtraContext) => setExtraState(next), []);

  const value = useMemo<AssistantPageContextValue>(
    () => ({ context: { ...base, ...extra }, setExtra }),
    [base, extra, setExtra]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistantPageContext(): AssistantPageContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistantPageContext deve ser usado dentro de AssistantPageContextProvider");
  return ctx;
}
