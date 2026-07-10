/**
 * Genera el contenido CSV (con BOM UTF-8 para compatibilidad con Excel).
 * Cada celda va entre comillas y las comillas internas se escapan duplicándolas.
 * Función pura — testeable sin DOM.
 */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const BOM = '\uFEFF';
  return (
    BOM +
    [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
  );
}

/** Genera el CSV y dispara la descarga en el navegador. */
export function downloadCsv(headers: string[], rows: (string | number)[][], filename: string): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
