"use client";

import { useRef, useState } from "react";
import { Bold, Eye, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, PenLine, Quote } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const previewComponents: Components = {
  h2: ({ children }) => <h2 className="mt-5 mb-2 font-serif text-xl font-semibold text-[#3A3028] first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-2 font-serif text-lg font-semibold text-[#3A3028] first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-7 text-[#4A4038] last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-[#4A4038]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-[#4A4038]">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-[#D9C4B2] pl-3 italic text-[#75675E]">{children}</blockquote>,
  strong: ({ children }) => <strong className="font-semibold text-[#3A3028]">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#607A56] underline">
      {children}
    </a>
  ),
};

type ToolbarAction = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  apply: (selected: string) => { text: string; cursorOffset?: number };
};

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "Negrito", icon: Bold, apply: (selected) => ({ text: `**${selected || "texto em negrito"}**` }) },
  { label: "Itálico", icon: Italic, apply: (selected) => ({ text: `*${selected || "texto em itálico"}*` }) },
  { label: "Subtítulo grande", icon: Heading2, apply: (selected) => ({ text: `## ${selected || "Subtítulo"}` }) },
  { label: "Subtítulo pequeno", icon: Heading3, apply: (selected) => ({ text: `### ${selected || "Subtítulo"}` }) },
  { label: "Lista com marcadores", icon: List, apply: (selected) => ({ text: (selected || "Item da lista").split("\n").map((line) => `- ${line}`).join("\n") }) },
  { label: "Lista numerada", icon: ListOrdered, apply: (selected) => ({ text: (selected || "Item da lista").split("\n").map((line, index) => `${index + 1}. ${line}`).join("\n") }) },
  { label: "Citação", icon: Quote, apply: (selected) => ({ text: `> ${selected || "Citação"}` }) },
  { label: "Link", icon: LinkIcon, apply: (selected) => ({ text: `[${selected || "texto do link"}](https://)` }) },
];

export function MarkdownEditor({ value, onChange, minHeightClassName = "min-h-64", placeholder }: {
  value: string;
  onChange: (value: string) => void;
  minHeightClassName?: string;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyAction(action: ToolbarAction) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const { text } = action.apply(selected);
    const nextValue = value.slice(0, start) + text + value.slice(end);
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#EDE1D6]">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#EDE1D6] bg-[#FBF7F1] p-1.5">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            title={action.label}
            aria-label={action.label}
            onClick={() => applyAction(action)}
            disabled={mode === "preview"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#75675E] transition hover:bg-white hover:text-[#3A3028] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <action.icon className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[#EDE1D6]" />
        <div className="ml-auto flex rounded-lg bg-white p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${mode === "edit" ? "bg-[#EAF0E4] text-[#607A56]" : "text-[#8C6E52]"}`}
          >
            <PenLine className="h-3.5 w-3.5" /> Editar
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${mode === "preview" ? "bg-[#EAF0E4] text-[#607A56]" : "text-[#8C6E52]"}`}
          >
            <Eye className="h-3.5 w-3.5" /> Pré-visualizar
          </button>
        </div>
      </div>
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`w-full resize-y border-0 px-3 py-2.5 text-sm leading-6 text-[#3A3028] outline-none ${minHeightClassName}`}
        />
      ) : (
        <div className={`overflow-y-auto bg-white px-4 py-3 ${minHeightClassName}`}>
          {value.trim() ? (
            <ReactMarkdown components={previewComponents}>{value}</ReactMarkdown>
          ) : (
            <p className="text-sm text-[#A9978A]">Nada para pré-visualizar ainda.</p>
          )}
        </div>
      )}
    </div>
  );
}
