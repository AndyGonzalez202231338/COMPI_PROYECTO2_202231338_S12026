import { Injectable, signal, computed } from '@angular/core';
import { Symbol } from '../models/symbol.model';

export interface SymbolRow {
  identifier: string;
  type: string;
  category: 'Variable' | 'Parámetro' | 'Componente' | 'Estilo' | 'Función' | 'Arreglo' | string;
  scope: string;
  value: unknown;
  line: number | null;
  column: number | null;
  file: string;
}

@Injectable({ providedIn: 'root' })
export class SymbolTableService {

  private _symbols = signal<Map<string, Symbol>>(new Map());

  readonly symbols = this._symbols.asReadonly();

  readonly styleNames = computed(() =>
    [...this._symbols().values()]
      .filter(s => s.kind === 'style')
      .map(s => s.name)
  );

  readonly componentNames = computed(() =>
    [...this._symbols().values()]
      .filter(s => s.kind === 'component')
      .map(s => s.name)
  );

  define(sym: Symbol): void {
    this._symbols.update(map => new Map(map).set(sym.name, sym));
  }

  lookup(name: string): Symbol | undefined {
    return this._symbols().get(name);
  }

  exists(name: string): boolean {
    return this._symbols().has(name);
  }

  clearAll(): void {
    this._symbols.set(new Map());
  }

  clearFromFile(fileOrigin: string): void {
    this._symbols.update(map => {
      const next = new Map(map);
      for (const [k, v] of next) {
        if (v.fileOrigin === fileOrigin) next.delete(k);
      }
      return next;
    });
  }

  private esc(v: unknown): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private fmt(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return `[${v.map(x => this.fmt(x)).join(', ')}]`;
    if (typeof v === 'object') return `<pre style="margin:0; white-space:pre-wrap;">${this.esc(JSON.stringify(v, null, 2))}</pre>`;
    return this.esc(v);
  }

  private categoryFromKind(kind?: string): string {
    switch ((kind ?? '').toLowerCase()) {
      case 'style': return 'Estilo';
      case 'component': return 'Componente';
      case 'function': return 'Función';
      case 'param':
      case 'parameter': return 'Parámetro';
      case 'array': return 'Arreglo';
      default: return 'Variable';
    }
  }

  private toRows(symbols: SymbolRow[] | any[]): SymbolRow[] {
    return (symbols ?? []).map((s: any) => ({
      identifier: s.identifier ?? s.name ?? '—',
      type: s.type ?? s.semanticType ?? s.kind ?? '—',
      category: s.category ?? this.categoryFromKind(s.kind),
      scope: s.scope ?? s.ambit ?? 'Global',
      value: s.value ?? s.init ?? s.data ?? null,
      line: s.line ?? s.loc?.line ?? null,
      column: s.column ?? s.loc?.col ?? s.loc?.column ?? null,
      file: s.file ?? s.fileOrigin ?? '—',
    }));
  }

  renderHtml(symbols: SymbolRow[] | any[]): string {
    const rows = this.toRows(symbols);

    const body = rows.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${this.esc(s.identifier)}</td>
        <td>${this.esc(s.type)}</td>
        <td>${this.esc(s.category)}</td>
        <td>${this.esc(s.scope)}</td>
        <td>${this.fmt(s.value)}</td>
        <td>${s.line ?? '—'}</td>
        <td>${s.column ?? '—'}</td>
        <td>${this.esc(s.file)}</td>
      </tr>
    `).join('');

    return `
      <div class="container py-4">
        <h1 class="mb-4">Tabla de símbolos</h1>
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
              ${body || `
                <tr>
                  <td colspan="9" class="text-center">Sin símbolos</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}