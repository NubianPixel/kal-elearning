/**
 * Minimal RFC 4180 CSV parser for the content pipeline.
 *
 * Handles quoted fields, "" escaped quotes, commas/newlines inside quotes,
 * CRLF and LF line endings, and an optional UTF-8 BOM (all present in
 * Google Sheets' CSV export). No dependency — this is deliberately small.
 */

export interface ParsedCsv {
  header: string[];
  /** One object per data row, keyed by header column name. */
  rows: Record<string, string>[];
}

/** Parse raw CSV text into a header + rows of raw string cells. */
export function parseCsv(text: string): ParsedCsv {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const table: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endField() {
    row.push(field);
    field = '';
  }
  function endRow() {
    endField();
    table.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      // Treat \r\n and lone \r as one row break.
      endRow();
      i += 1;
      if (text[i] === '\n') i += 1;
      continue;
    }
    if (c === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // Final field/row, unless the file ended cleanly on a line break.
  if (field !== '' || row.length > 0) {
    endRow();
  }

  // Drop trailing blank rows (e.g. trailing newline, or a stray blank line).
  while (table.length > 0 && table[table.length - 1].every((cell) => cell === '')) {
    table.pop();
  }

  if (table.length === 0) return { header: [], rows: [] };
  const [header, ...dataRows] = table;
  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = cells[idx] ?? '';
    });
    return record;
  });
  return { header, rows };
}
