import { Injectable } from '@angular/core';
import { tokenize, LexError as LexerError, Token } from '../../generated/highlighter-lexer';
import { highlightStyles } from '../../generated/styles-lexer';

// Re-exportar LexError con la forma que usa editor.ts
export interface LexError {
  line: number;
  column: number;
  lexeme: string;
  type: string;
  description: string;
}

export interface ParseResult {
  html: string;
  lexicalErrors: LexError[];
  syntaxErrors: LexError[];
}

// ── Mapa de tipos de token a clases CSS (definidas en src/styles.css) ──
const TOKEN_CLASS: Partial<Record<string, string>> = {
  KEYWORD:    'tok-keyword',
  IDENTIFIER: 'tok-identifier',
  STRING:     'tok-string',
  NUMBER:     'tok-number',
  OPERATOR:   'tok-operator',
  SYMBOL:     'tok-symbol',
  COMMENT:    'tok-comment',
  HEX_COLOR:  'tok-color',
  BOOLEAN:    'tok-keyword',
  NULL_LITERAL: 'tok-keyword',
  FOR_VARIABLE: 'tok-identifier',
  PROPERTY:   'tok-property',
  ERROR:      'tok-error',
};

function tokensToHtml(tokens: Token[], originalCode: string): string {
  // Guard: if the tokenizer dropped characters (exception mid-stream),
  // fall back to plain escaped text so textarea and pre stay in sync.
  const reconstructed = tokens.map(t => t.value).join('');
  if (reconstructed !== originalCode) {
    console.warn('Token mismatch:', { original: originalCode.length, reconstructed: reconstructed.length });
    return esc(originalCode);
  }

  let result = '';
  for (const tok of tokens) {
    if (tok.type === 'NEWLINE') {
      result += '\n';
    } else if (tok.type === 'WHITESPACE') {
      result += esc(tok.value);
    } else {
      const escaped = esc(tok.value);
      const cls = TOKEN_CLASS[tok.type];
      result += cls ? `<span class="${cls}">${escaped}</span>` : escaped;
    }
  }

  return result;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeLexErrors(raw: LexerError[]): LexError[] {
  return raw.map(e => ({
    line:        e.line,
    column:      e.column,
    lexeme:      e.lexeme,
    type:        e.type,
    description: e.description,
  }));
}

function normalizeSyntaxErrors(raw: any[]): LexError[] {
  return (raw ?? []).map((e: any) => ({
    line:        e.line ?? e.linea ?? 1,
    column:      e.col  ?? e.column ?? e.columna ?? 1,
    lexeme:      e.lexeme ?? e.lexema ?? '?',
    type:        e.type   ?? 'Sintáctico',
    description: e.description ?? e.descripcion ?? e.message ?? 'Error sintáctico',
  }));
}

@Injectable({ providedIn: 'root' })
export class HighlightingService {
  private yParser:    any = null;
  private compParser: any = null;

  constructor() {
    try {
      this.yParser = require('../../generated/y-parser.js');
    } catch { /* parser no disponible aún */ }
    try {
      this.compParser = require('../../generated/comp-parser.js');
    } catch { /* parser no disponible aún */ }
  }

  // ── .y files ──────────────────────────────────────────────────
  analyzeY(code: string): ParseResult {
    // 1. Lexer especializado → HTML coloreado + errores léxicos
    const { tokens, errors: lexErrs } = tokenize(code);
    const html = tokensToHtml(tokens, code);

    // 2. Parser completo → errores sintácticos
    let synErrs: LexError[] = [];
    if (this.yParser && code.trim()) {
      try {
        if (typeof this.yParser._reset === 'function') this.yParser._reset();
        this.yParser.parse(code);
        synErrs = normalizeSyntaxErrors(this.yParser._getSyntaxErrors?.() ?? []);
      } catch (e: any) {
        // El parser lanza excepción en errores graves — extraemos la info
        const loc = e.hash?.loc ?? { first_line: 1, first_column: 1 };
        synErrs = [{
          line:        loc.first_line,
          column:      loc.first_column,
          lexeme:      e.hash?.text ?? '?',
          type:        'Sintáctico',
          description: e.message ?? 'Error sintáctico',
        }];
      }
    }

    return { html, lexicalErrors: normalizeLexErrors(lexErrs), syntaxErrors: synErrs };
  }

  // ── .comp files ───────────────────────────────────────────────
  analyzeComp(code: string): ParseResult {
    // 1. Mismo lexer de highlighting (misma gramática base)
    const { tokens, errors: lexErrs } = tokenize(code);
    const html = tokensToHtml(tokens, code);

    // 2. Parser de componentes → errores léxicos y sintácticos completos
    let allLexErrs = normalizeLexErrors(lexErrs);
    let synErrs: LexError[] = [];

    if (this.compParser && code.trim()) {
      try {
        const result = this.compParser.parseComp(code);
        // Los errores del comp-parser tienen mayor detalle; usamos los suyos si hay
        if (result.lexErrors?.length) {
          allLexErrs = normalizeSyntaxErrors(result.lexErrors);
        }
        synErrs = normalizeSyntaxErrors(result.syntaxErrors ?? []);
      } catch (e: any) {
        const loc = e.hash?.loc ?? { first_line: 1, first_column: 1 };
        synErrs = [{
          line:        loc.first_line,
          column:      loc.first_column,
          lexeme:      e.hash?.text ?? '?',
          type:        'Sintáctico',
          description: e.message ?? 'Error sintáctico',
        }];
      }
    }

    return { html, lexicalErrors: allLexErrs, syntaxErrors: synErrs };
  }

  // ── .styles files ─────────────────────────────────────────────
  analyzeStyles(code: string): ParseResult {
    if (!code.trim()) {
      return { html: '', lexicalErrors: [], syntaxErrors: [] };
    }
    const { html, errors } = highlightStyles(code);
    const lexicalErrors: LexError[] = errors.map(e => ({
      line:        e.line,
      column:      e.column,
      lexeme:      e.lexeme,
      type:        e.type,
      description: e.description,
    }));
    return { html, lexicalErrors, syntaxErrors: [] };
  }

  // ── .sql files ────────────────────────────────────────────────
  analyzeSql(code: string): ParseResult {
    // Sin lexer especializado para SQL — resaltar con regex básico
    const html = this.highlightSqlBasic(code);
    return { html, lexicalErrors: [], syntaxErrors: [] };
  }

  // ── Fallback genérico ─────────────────────────────────────────
  analyze(code: string): ParseResult {
    return { html: esc(code), lexicalErrors: [], syntaxErrors: [] };
  }

  private highlightSqlBasic(code: string): string {
    const SQL_KW = /\b(TABLE|COLUMNS|DELETE|IN|INT|FLOAT|STRING|BOOLEAN|CHAR|SELECT|FROM|WHERE|INSERT|UPDATE|CREATE|DROP)\b/g;
    return esc(code)
      .replace(SQL_KW, kw => `<span class="tok-keyword">${kw}</span>`)
      .replace(/("(?:[^"])*"|'(?:[^'])*')/g, s => `<span class="tok-string">${s}</span>`)
      .replace(/\b(\d+(?:\.\d+)?)\b/g, n => `<span class="tok-number">${n}</span>`);
  }
}
