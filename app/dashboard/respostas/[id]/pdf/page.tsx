import { redirect } from "next/navigation";

export default async function OldPDFPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/submissions/${id}/print`);
}
