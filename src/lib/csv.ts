// CSV para Excel: UTF-8 con BOM, separador ";" (Excel en español) y comillas escapadas.
// Los textos que empiezan con = + - @ se prefijan con ' para que Excel no los ejecute como fórmula.
const cell = (v: string | number): string => {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
