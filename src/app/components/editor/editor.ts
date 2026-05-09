import {
  Component,
  inject,
  AfterViewInit,
  ElementRef,
  ViewChild,
  PLATFORM_ID,
  signal,
  Injector,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { effect } from '@angular/core';
import { FileSystemService } from '../../services/file-system.service';
import { HighlightingService, LexError } from '../../services/highlighting.service';
import { ErrorReporterService } from '../../services/error-reporter.service';
import { FileNode } from '../../models/file-node.model';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor.html',
  styleUrl: './editor.css',
})
export class EditorComponent implements AfterViewInit {
  
  @ViewChild('codeInput')      private codeInput!:      ElementRef<HTMLTextAreaElement>;
  @ViewChild('highlightLayer') private highlightLayer!: ElementRef<HTMLPreElement>;
  @ViewChild('gutter')         private gutter!:         ElementRef<HTMLDivElement>;

  readonly fs           = inject(FileSystemService);
  private  hl           = inject(HighlightingService);
  private  errorReporter = inject(ErrorReporterService);
  private  platformId   = inject(PLATFORM_ID);
  private  injector     = inject(Injector);

  highlightedHtml  = signal('');
  lexicalErrors    = signal<LexError[]>([]);
  lineNums         = signal<number[]>([1]);

  private savedCursor: { start: number; end: number } | null = null;

  // Inicialización
  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    effect(() => {
      // Solo trackea el ID activo, no el contenido del archivo.
      void this.fs.activeFileId();
      
      this.errorReporter.clearAll();
      
      Promise.resolve().then(() => {
        const textarea = this.codeInput?.nativeElement;
        if (!textarea) return;
        const content = this.fs.activeFile()?.content ?? '';
        textarea.value = content;
        
        textarea.scrollTop  = 0;
        textarea.scrollLeft = 0;
        const pre = this.highlightLayer?.nativeElement;
        if (pre) { pre.scrollTop = 0; pre.scrollLeft = 0; }
        const gut = this.gutter?.nativeElement;
        if (gut) gut.scrollTop = 0;
        this._applyHighlight(content);
        textarea.focus();
      });
    }, { injector: this.injector });
  }

  onInput(): void {
    const code = this.codeInput.nativeElement.value;
    this._applyHighlight(code);
    const id = this.fs.activeFileId();
    if (id) this.fs.updateContent(id, code);
  }

  // Textarea scrolled (keyboard nav, mouse wheel over textarea)
  onTextareaScroll(): void {
    const ta  = this.codeInput.nativeElement;
    const pre = this.highlightLayer.nativeElement;
    pre.scrollTop  = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
    this.gutter.nativeElement.scrollTop = ta.scrollTop;
  }

  // Pre scrolled (user clicked the visible scrollbar on the pre layer)
  onPreScroll(): void {
    const pre = this.highlightLayer.nativeElement;
    const ta  = this.codeInput.nativeElement;
    ta.scrollTop  = pre.scrollTop;
    ta.scrollLeft = pre.scrollLeft;
    this.gutter.nativeElement.scrollTop = pre.scrollTop;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      const ta    = this.codeInput.nativeElement;
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      ta.value    = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      this.onInput();
    }
  }

  onBlur(): void {
    const ta = this.codeInput?.nativeElement;
    if (ta) {
      this.savedCursor = { start: ta.selectionStart, end: ta.selectionEnd };
    }
  }

  insertAtCursor(text: string): void {
    const ta = this.codeInput?.nativeElement;
    if (!ta) return;
    const start = this.savedCursor?.start ?? ta.selectionStart ?? ta.value.length;
    const end   = this.savedCursor?.end   ?? ta.selectionEnd   ?? ta.value.length;
    ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + text.length;
    this.savedCursor = null;
    this.onInput();
    ta.focus();
  }

  cleanDesc(msg: string): string {
    if (!msg) return '';
    return msg
      .replace(/^Parse error on line \d+:\s*/i, '')
      .replace(/\.\.\.[^\n]*\n?[^\n]*\^\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  selectTab(file: FileNode): void {
    this.fs.setActive(file.id);
  }

  closeTab(event: MouseEvent, file: FileNode): void {
    event.stopPropagation();
    this.fs.closeFile(file.id);
  }

  isActiveTab(file: FileNode): boolean {
    return this.fs.activeFileId() === file.id;
  }

  getTabIcon(file: FileNode): string {
    const icons: Record<string, string> = {
      y:      'bi bi-file-code',
      comp:   'bi bi-puzzle',
      styles: 'bi bi-palette',
      sql:    'bi bi-database',
    };
    return icons[file.type] ?? 'bi bi-file-earmark';
  }


  /**
   * Aplica highlight y actualiza HTML + errores + números de línea
   */
  private _applyHighlight(code: string): void {
    const fileType = this.fs.activeFile()?.type ?? 'y';
    const fileId = this.fs.activeFileId();

    let result;

    if (fileType === 'styles') {
      result = this.hl.analyzeStyles(code);
    } else if (fileType === 'y') {
      result = this.hl.analyzeY(code);
    } else if (fileType === 'comp') {
      result = this.hl.analyzeComp(code);
    } else if (fileType === 'sql') {
      result = this.hl.analyzeSql(code);
    } else {
      result = this.hl.analyze(code);
    }

    this.highlightedHtml.set(result.html || this._escapeHtml(code));
    this.lexicalErrors.set(result.lexicalErrors);

    // Actualizar números de línea
    const count = code === '' ? 1 : code.split('\n').length;
    this.lineNums.set(Array.from({ length: count }, (_, i) => i + 1));

    // Registrar errores en el reporter
    if (fileId) {
      this._registerErrors(fileId, result);
    }
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Registra los errores encontrados en el ErrorReporterService
   */
  private _registerErrors(fileId: string, result: any): void {
    // Limpiar errores previos del archivo
    this.errorReporter.clearFileErrors(fileId);

    // Registrar errores léxicos
    result.lexicalErrors.forEach((err: LexError) => {
      this.errorReporter.add({
        lexema: err.lexeme,
        linea: err.line,
        columna: err.column,
        tipo: 'Léxico',
        descripcion: err.description,
        fileId
      });
    });

    // Registrar errores sintácticos
    result.syntaxErrors?.forEach((err: any) => {
      this.errorReporter.add({
        lexema: err.lexeme || err.message || 'Error',
        linea: err.line || 1,
        columna: err.column || 1,
        tipo: 'Sintáctico',
        descripcion: err.description || err.message || 'Error sintáctico',
        fileId
      });
    });
  }
}
