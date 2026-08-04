export function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index++) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "-" && next === "-") {
      current += char + next;
      index++;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "/" && next === "*") {
      current += char + next;
      index++;
      inBlockComment = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      current += char;
      if (inSingleQuote && next === "'") {
        current += next;
        index++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (!inSingleQuote && char === '"') {
      current += char;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  if (inSingleQuote || inDoubleQuote || inBlockComment) {
    throw new Error("SQL incompleto: aspas ou comentario de bloco sem fechamento.");
  }
  return statements;
}

export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim();
}

export function isTransactionStatement(statement) {
  const normalized = stripSqlComments(statement).replace(/\s+/g, " ").toUpperCase();
  return /^(BEGIN( DEFERRED| IMMEDIATE| EXCLUSIVE)?( TRANSACTION)?|COMMIT( TRANSACTION)?|ROLLBACK( TRANSACTION)?)$/.test(
    normalized
  );
}

export function isAlterAddColumnStatement(statement) {
  return /^ALTER\s+TABLE\s+[\w"`[\].]+\s+ADD\s+COLUMN\s+/i.test(stripSqlComments(statement));
}

export function isDuplicateColumnError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate column name/i.test(message);
}
