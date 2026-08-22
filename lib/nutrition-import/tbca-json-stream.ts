import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * FASE 5 — leitor streaming de tbca_completa.json (~610 MB). NUNCA faz
 * JSON.parse do arquivo inteiro nem guarda o arquivo completo em memoria:
 * le linha a linha (o arquivo e pretty-printed com indentacao consistente,
 * confirmado por leitura direta do cabecalho/rodape reais) e acumula
 * apenas as linhas do registro (alimento) sendo lido no momento, dentro de
 * uma das collections-alvo. Memoria em uso fica limitada ao maior registro
 * individual, nunca ao arquivo inteiro.
 *
 * Estrutura real confirmada (nao e a suposta em versoes anteriores do
 * desenho): { schema_version, source, normalization,
 * collections: { <nome_da_collection>: [ {...}, {...} ] , ... },
 * complementary_source }.
 */

export interface TbcaRawRecord {
  collection: string;
  raw: string;
}

/**
 * Calcula o delta de profundidade de chaves/colchetes numa unica linha,
 * ignorando caracteres dentro de strings JSON. Uma string JSON valida nunca
 * contem uma quebra de linha literal (precisa ser \n escapado), entao
 * processar linha a linha nunca corta uma string ao meio — o estado
 * in-string/escape nao precisa (e nao pode) ser carregado entre linhas.
 */
function lineDepthDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") delta += 1;
    else if (char === "}" || char === "]") delta -= 1;
  }
  return delta;
}

const COLLECTIONS_START = /^\s*"collections":\s*\{\s*$/;
const ARRAY_KEY = /^\s*"([a-z0-9_]+)":\s*\[\s*$/;
const CLOSING_BRACE = /^\s*\},?\s*$/;

type Mode = "seeking-collections" | "seeking-key" | "skipping-value" | "in-target-array" | "finished";

/**
 * Itera registros crus (string JSON de um unico objeto) das collections
 * pedidas, na ordem em que aparecem no arquivo. Fecha o stream assim que a
 * ultima collection relevante termina, sem ler o resto do arquivo
 * (complementary_source, retrieval, etc. — irrelevantes para a importacao).
 */
export async function* iterateTbcaCollectionRecords(
  filePath: string,
  targetCollections: readonly string[]
): AsyncGenerator<TbcaRawRecord> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let mode: Mode = "seeking-collections";
  let currentCollection: string | null = null;
  let recordLines: string[] = [];
  let recordDepth = 0;
  let skipDepth = 0;

  try {
    for await (const line of rl) {
      if (mode === "seeking-collections") {
        if (COLLECTIONS_START.test(line)) mode = "seeking-key";
        continue;
      }

      if (mode === "seeking-key") {
        const arrayKeyMatch = ARRAY_KEY.exec(line);
        if (arrayKeyMatch) {
          currentCollection = arrayKeyMatch[1];
          mode = targetCollections.includes(currentCollection) ? "in-target-array" : "skipping-value";
          skipDepth = 1; // ja consumimos o '[' de abertura desta linha
          continue;
        }
        if (CLOSING_BRACE.test(line)) {
          mode = "finished";
          break; // fim do objeto "collections" — nada relevante depois disso
        }
        continue;
      }

      if (mode === "skipping-value") {
        skipDepth += lineDepthDelta(line);
        if (skipDepth <= 0) mode = "seeking-key";
        continue;
      }

      // mode === "in-target-array"
      const trimmed = line.trim();
      if (recordLines.length === 0) {
        if (trimmed === "]" || trimmed === "],") {
          mode = "seeking-key";
          continue;
        }
        if (!trimmed.startsWith("{")) continue; // linha em branco/ruido entre registros
        recordLines.push(line);
        recordDepth = lineDepthDelta(line);
        if (recordDepth === 0) {
          yield { collection: currentCollection as string, raw: recordLines.join("\n").replace(/,\s*$/, "") };
          recordLines = [];
        }
        continue;
      }

      recordLines.push(line);
      recordDepth += lineDepthDelta(line);
      if (recordDepth === 0) {
        yield { collection: currentCollection as string, raw: recordLines.join("\n").replace(/,\s*$/, "") };
        recordLines = [];
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

export function parseTbcaRawRecord<T = Record<string, unknown>>(record: TbcaRawRecord): T {
  return JSON.parse(record.raw) as T;
}
