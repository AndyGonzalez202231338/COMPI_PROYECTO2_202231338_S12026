import { CommonModule } from '@angular/common';
import { Component, inject, computed, ChangeDetectorRef, effect } from '@angular/core';

import { ErrorReporterService } from '../../services/error-reporter.service';
import { FileSystemService } from '../../services/file-system.service';
import { ErrorEntry } from '../../models/error-entry.model';
import { ParserRunnerService } from '../../services/parser-runner.service';

@Component({
  selector: 'app-error-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-panel.html',
  styleUrls: ['./error-panel.css']
})
export class ErrorPanel {

  private er = inject(ErrorReporterService);
  private fs = inject(FileSystemService);
  private runner = inject(ParserRunnerService);
  private cdr    = inject(ChangeDetectorRef);

readonly errors = computed(() => {
  const all = [...this.er.errorSignal()];
  const syntaxErrors = all.filter(e => e.tipo === 'Sintáctico' || e.tipo === 'Léxico');
  // Si hay errores de sintaxis o léxicos, mostrarlos primero
  if (syntaxErrors.length > 0) {
    return syntaxErrors.sort((a, b) => {
      const fa = this.fileName(a.fileId);
      const fb = this.fileName(b.fileId);
      if (fa !== fb) return fa.localeCompare(fb);
      if (a.linea !== b.linea) return a.linea - b.linea;
      return a.columna - b.columna;
    });
  }
  // Si no hay errores de sintaxis, mostrar los semánticos
  const semanticErrors = all.filter(e => e.tipo === 'Semántico');
  return semanticErrors.sort((a, b) => {
    const fa = this.fileName(a.fileId);
    const fb = this.fileName(b.fileId);
    if (fa !== fb) return fa.localeCompare(fb);
    if (a.linea !== b.linea) return a.linea - b.linea;
    return a.columna - b.columna;
  });
});
  

  fileName(fileId?: string): string {

    if (!fileId) {
      return '—';
    }

    const file = this.fs.findById(fileId);

    return file
      ? `${file.name}.${file.type}`
      : fileId;
  }

  severityClass(tipo: ErrorEntry['tipo']): string {

    if (tipo === 'Semántico') {
      return 'severity-warning';
    }

    return 'severity-error';
  }

  typeClass(tipo: string): string {

    return 'type-' +
      tipo
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
  }

  cleanMessage(msg: string): string {

    if (!msg) {
      return '';
    }

    return msg
      .replace(/^Parse error on line \d+:\s*/i, '')
      .replace(/\.\.\.[^\n]*\n?[^\n]*\^\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

}