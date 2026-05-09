import { Injectable } from '@angular/core';
import { Symbol } from '../models/symbol.model';

@Injectable({ providedIn: 'root' })
export class CodegenService {

  /** Combina HTML + CSS en un archivo HTML autocontenido descargable */
  buildHtml(bodyHtml: string, css: string, title = 'YFERA App'): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
${css}
  </style>
</head>
<body>
${bodyHtml}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js">
  </script>
</body>
</html>`;
  }

  private prettyLabel(text: string): string {
    return String(text)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  private summarizeValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) return `Array(${value.length})`;

    const obj = value as Record<string, unknown>;
    const type = obj['type'];

    if (typeof type === 'string') {
      const params = obj['params'];
      const body = obj['body'];
      const rows = obj['rows'];

      if (Array.isArray(params)) return `${type} (${params.length} params)`;
      if (Array.isArray(body)) return `${type} (${body.length} items)`;
      if (Array.isArray(rows)) return `${type} (${rows.length} rows)`;
      return type;
    }

    return 'Objeto';
  }

  private normalizeSymbol(sym: any): {
    identifier: string;
    type: string;
    category: string;
    scope: string;
    value: string;
    line: number | null;
    column: number | null;
    file: string;
  } {
    const kind = String(sym?.kind ?? sym?.category ?? sym?.type ?? '').toLowerCase();

    const category =
      kind === 'style' ? 'Estilo' :
      kind === 'component' ? 'Componente' :
      kind === 'function' || kind === 'func' ? 'Función' :
      kind === 'param' || kind === 'parameter' ? 'Parámetro' :
      kind === 'array' ? 'Arreglo' :
      kind === 'variable' ? 'Variable' :
      this.prettyLabel(sym?.category ?? sym?.kind ?? 'Variable');

    return {
      identifier: String(sym?.identifier ?? sym?.name ?? '—'),
      type: String(sym?.type ?? sym?.kind ?? '—'),
      category,
      scope: String(sym?.scope ?? sym?.ambit ?? 'Global'),
      value: this.summarizeValue(sym?.value),
      line: sym?.line ?? sym?.loc?.line ?? sym?.position?.line ?? sym?.meta?.line ?? null,
      column: sym?.column ?? sym?.col ?? sym?.loc?.col ?? sym?.loc?.column ?? sym?.position?.column ?? sym?.meta?.col ?? null,
      file: String(sym?.file ?? sym?.origin ?? sym?.fileOrigin ?? '—'),
    };
  }

  /** Genera un HTML con la tabla de símbolos */
  buildSymbolTableHtml(symbols: Symbol[], title = 'Tabla de símbolos'): string {
    const rows = symbols.map((sym: any, index) => {
      const s = this.normalizeSymbol(sym);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${this.escapeHtml(s.identifier)}</td>
          <td>${this.escapeHtml(s.type)}</td>
          <td>${this.escapeHtml(s.category)}</td>
          <td>${this.escapeHtml(s.scope)}</td>
          <td>${this.escapeHtml(s.value)}</td>
          <td>${s.line ?? '—'}</td>
          <td>${s.column ?? '—'}</td>
          <td>${this.escapeHtml(s.file)}</td>
        </tr>
      `;
    }).join('');

    return this.buildHtml(`
      <div class="container py-4">
        <h1 class="mb-4">${this.escapeHtml(title)}</h1>
        <div class="table-responsive">
          <table class="table table-bordered table-striped table-hover table-sm align-middle">
            <thead class="table-dark">
              <tr>
                <th>#</th>
                <th>Identificador</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Ámbito</th>
                <th>Valor</th>
                <th>Línea</th>
                <th>Columna</th>
                <th>Archivo</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="9" class="text-center">Sin símbolos</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `, '', title);
  }

  /** Descarga el string como archivo */
  download(content: string, filename: string, mime = 'text/html'): void {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: filename
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Exporta el árbol de trabajo como ZIP (usa JSZip) */
  async exportZip(pathMap: Map<string, string>, projectName: string): Promise<void> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const [path, content] of pathMap) {
      zip.file(path.replace('./', ''), content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    this.download(URL.createObjectURL(blob), `${projectName}.zip`, 'application/zip');
  }

  private escapeHtml(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}