import {
  Component,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { SqlService } from '../../services/sql.service';

const SQL_KEYWORDS = new Set([
  'TABLE', 'COLUMNS', 'DELETE', 'IN',
  'INT', 'FLOAT', 'STRING', 'BOOLEAN', 'CHAR',
]);

@Component({
  selector: 'app-sql-console',
  imports: [],
  templateUrl: './sql-console.html',
  styleUrl: './sql-console.css',
})
export class SqlConsole implements AfterViewInit {
  readonly sql = inject(SqlService);

  @ViewChild('queryInput')   private queryInput!:   ElementRef<HTMLTextAreaElement>;
  @ViewChild('highlightPre') private highlightPre!: ElementRef<HTMLPreElement>;
  @ViewChild('historyEl')    private historyEl!:    ElementRef<HTMLDivElement>;

  highlighted = signal('');

  ngAfterViewInit(): void {
    this.highlighted.set(this.highlightSql(''));
  }

  onInput(): void {
    const val = this.queryInput.nativeElement.value;
    this.highlighted.set(this.highlightSql(val));
    this.syncScroll();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.run();
    }
  }

  async run(): Promise<void> {
    const query = this.queryInput.nativeElement.value.trim();
    if (!query) return;
    await this.sql.execute(query);
    this.queryInput.nativeElement.value = '';
    this.highlighted.set(this.highlightSql(''));
    setTimeout(() => this.scrollHistoryToBottom(), 0);
  }

  clear(): void {
    this.sql.clearHistory();
  }

  columns(row: Record<string, unknown>): string[] {
    return Object.keys(row);
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString('es-GT', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  private syncScroll(): void {
    const ta  = this.queryInput?.nativeElement;
    const pre = this.highlightPre?.nativeElement;
    if (ta && pre) {
      pre.scrollTop  = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  }

  private scrollHistoryToBottom(): void {
    const el = this.historyEl?.nativeElement;
    if (el) {
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  private highlightSql(code: string): string {
    if (!code) return '<br>';
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped.replace(
      /("(?:[^"])*")|('(?:[^'])*')|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)/g,
      (match, dblStr, sglStr, num, word) => {
        if (dblStr || sglStr) 
          return `<span class="sql-str">${match}</span>`;
        if (num)  
          return `<span class="sql-num">${num}</span>`;
        if (word && SQL_KEYWORDS.has(word.toUpperCase()))
          return `<span class="sql-kw">${word}</span>`;
        return `<span class="sql-ident">${word}</span>`;
      },
    ) + '\n';
  }
}