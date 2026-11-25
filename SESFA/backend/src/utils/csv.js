// Geração de CSV segura: protege contra injeção de fórmulas em planilhas.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
    let text = value == null ? '' : String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
    text = text.replace(/\r\n|\r|\n/g, ' ');
    return /[;"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Separador ";" (padrão do Excel em pt-BR), UTF-8 com BOM e quebras CRLF. */
export function buildCsv(headers, rows) {
    const lines = [headers, ...rows].map((row) => row.map(csvCell).join(';'));
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}
