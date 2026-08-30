import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { getPatientPortalFile } from "@/lib/repositories/patient-deliverables";
import { getPatientFilesStorage } from "@/lib/storage/patient-files";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { fileId } = await params;
  const file = await getPatientPortalFile(session.sub, fileId);
  if (!file) return NextResponse.json({ message: "Arquivo nao encontrado." }, { status: 404 });
  let object;
  try {
    object = await getPatientFilesStorage().get(file.object_key);
  } catch {
    return NextResponse.json({ message: "Arquivo indisponivel no momento." }, { status: 503 });
  }
  if (!object) return NextResponse.json({ message: "Arquivo indisponivel." }, { status: 404 });
  return new NextResponse(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? file.mime_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
