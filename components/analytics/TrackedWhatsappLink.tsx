"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { trackEvent } from "@/lib/analytics/client-tracker";

/**
 * Anchor de WhatsApp instrumentado — usado em pontos do site que sao
 * server components (footer, hero), onde nao vale a pena converter o
 * arquivo inteiro para client component so por causa deste onClick.
 */
export function TrackedWhatsappLink({
  href,
  location,
  children,
  className,
  ...rest
}: {
  href: string;
  location: string;
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick" | "className">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackEvent("WHATSAPP_CLICK", { metadata: { location } })}
      {...rest}
    >
      {children}
    </a>
  );
}
