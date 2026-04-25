"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function OldResponseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard/submissions/${id}`);
  }, [id, router]);

  return (
    <div className="text-center py-20 text-[#8C6E52]">Redirecionando...</div>
  );
}
