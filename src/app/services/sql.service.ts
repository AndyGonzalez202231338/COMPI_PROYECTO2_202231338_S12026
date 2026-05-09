import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FileSystemService } from './file-system.service';
import * as SqlParser from '../../generated/sql-parser';

export interface ConsoleEntry {
  query: string;
  timestamp: Date;
  errors: Array<{ kind: 'lex' | 'syn'; description: string; line: number; col: number }>;
  message?: string;
  rows?: any[];
}

@Injectable({ providedIn: 'root' })
export class SqlService {
  private http    = inject(HttpClient);
  private fs      = inject(FileSystemService);
  private apiUrl  = 'http://localhost:3000/api/sql/execute';

  readonly history = signal<ConsoleEntry[]>([]);

  async execute(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;

    const entry: ConsoleEntry = {
      query: trimmed,
      timestamp: new Date(),
      errors: [],
    };

    // 1. Parsear con Jison
    // ✅ Resetear y obtener AST con getter methods
    (SqlParser as any).parser._reset?.();
    (SqlParser as any).parse(trimmed);

    const parseResult = {
      ast: (SqlParser as any).parser._getAST?.() || [],
      lexErrors: (SqlParser as any).parser._getLexicalErrors?.() || [],
      syntaxErrors: (SqlParser as any).parser._getSyntaxErrors?.() || [],
    };

    // 2. Recolectar errores léxicos y sintácticos
    if (parseResult.lexErrors?.length) {
      for (const err of parseResult.lexErrors) {
        entry.errors.push({
          kind: 'lex',
          description: err.description,
          line: err.line || 0,
          col: err.col || 0,
        });
      }
    }
    if (parseResult.syntaxErrors?.length) {
      for (const err of parseResult.syntaxErrors) {
        entry.errors.push({
          kind: 'syn',
          description: err.description,
          line: err.line || 0,
          col: err.col || 0,
        });
      }
    }

    if (entry.errors.length > 0) {
      this.addToHistory(entry);
      return;
    }

    // 3. Ejecutar secuencialmente contra la DB del proyecto actual
    const statements = Array.isArray(parseResult.ast) ? parseResult.ast : [parseResult.ast];
    const project    = this.fs.projectName();

    let finalMessage = '';
    let allRows: any[] = [];

    for (const stmt of statements) {
      try {
        const response: any = await firstValueFrom(
          this.http.post(this.apiUrl, { ast: stmt, project })
        );

        if (!response.success) {
          entry.errors.push({ kind: 'syn', description: response.error, line: 0, col: 0 });
          break;
        }

        // Si se creó (o ya existía) una tabla, reflejar la DB en el árbol de trabajo
        if (response.data?.created || response.data?.already) {
          this.fs.ensureDbNode(project);
        }

        if (response.data?.message) finalMessage += (finalMessage ? ' · ' : '') + response.data.message;
        if (response.data?.rows)    allRows.push(...response.data.rows);

      } catch (err: any) {
        entry.errors.push({
          kind: 'syn',
          description: `Error de red o servidor: ${err.message}`,
          line: 0,
          col: 0,
        });
      }
    }

    if (entry.errors.length === 0) {
      entry.message = finalMessage || 'Consulta ejecutada exitosamente';
      if (allRows.length > 0) entry.rows = allRows;
    }

    this.addToHistory(entry);
  }

  clearHistory(): void {
    this.history.set([]);
  }

  private addToHistory(entry: ConsoleEntry): void {
    this.history.update(h => [...h, entry]);
  }
}
