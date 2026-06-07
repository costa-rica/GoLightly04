function escapeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}
