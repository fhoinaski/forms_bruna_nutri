"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * R6.5.3 (seções 8, 89) — Escape fecha + Tab/Shift+Tab nunca escapam do
 * diálogo aberto. Extraído de 2 implementações copy-paste idênticas
 * (ExchangeGroupPanel/drawer de trocas em MealItemsEditor.tsx e
 * ReuseLibraryDrawer.tsx) pra virar a base compartilhada de QUALQUER
 * diálogo/drawer novo (ex.: AiMealPlanWizard, que não tinha nenhum
 * tratamento de teclado antes desta fase).
 */
export function useDialogKeyboard(containerRef: RefObject<HTMLElement | null>, onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const container = containerRef.current;
        if (!container) return;
        const focusable = Array.from(container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onClose]);
}
