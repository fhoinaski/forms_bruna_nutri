"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics/client-tracker";

export function TrackBlogView({ slug }: { slug: string }) {
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackEvent("BLOG_VIEW", { metadata: { slug } });
  }, [slug]);
  return null;
}
