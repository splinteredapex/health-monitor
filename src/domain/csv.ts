/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends object>(rows: readonly T[], columns: ReadonlyArray<[header: string, get: (r: T) => unknown]>): string {
  const head = columns.map(([h]) => csvCell(h)).join(',');
  const body = rows.map((r) => columns.map(([, g]) => csvCell(g(r))).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

/** Minimal CSV parser (quoted fields, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}
