import { createHash, randomUUID } from "node:crypto";

/**
 * UUID determinístico seguindo a construção padronizada do RFC 4122 (v5,
 * namespace + nome via SHA-1). Não há algoritmo criptográfico próprio aqui —
 * apenas a transformação canônica de um hash SHA-1 nos bits/versão/variant
 * exigidos pela especificação.
 *
 * Usado pelo fluxo de intake para derivar o id de submissão de forma
 * determinística a partir do (sessionId + payload canônico) — assim uma
 * reexecução de `complete` produz o MESMO id e a gravação é idempotente,
 * sem duplicar submissões.
 */

const INTAKE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // namespace URL (RFC 4122)

export function deterministicUuidV5(name: string, namespace: string = INTAKE_NAMESPACE): string {
  const namespaceBytes = parseUuidToBytes(namespace);
  // SHA-1 de namespace+name produz 20 bytes; o RFC 4122 §4.3 usa apenas os
  // PRIMEIROS 16 bytes do hash como o UUID.
  const hash = createHash("sha1")
    .update(namespaceBytes)
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);

  // RFC 4122 §4.3: set version (4 bits = 5) and variant (2 MSB = 10).
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return bytesToUuid(hash);
}

/** Valida e converte um UUID textual nos 16 bytes canônicos (aceita traço). */
function parseUuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`Invalid namespace UUID: ${uuid}`);
  }
  return Buffer.from(hex, "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export { randomUUID };