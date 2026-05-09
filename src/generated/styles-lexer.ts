// Tokenizador para el lenguaje YFERA .styles
// Case-insensitive, maneja tokens multi-palabra y preserva espacios/saltos.

import type { LexError } from './highlighter-lexer';

export type StylesTokenType =
  | 'KEYWORD'     // extends, @for, from, through, to
  | 'PROPERTY'    // height, width, background color, border radius, etc.
  | 'VALUE'       // CENTER, solid, HELVETICA, SANS SERIF, etc.
  | 'STRING'      // "center", "Helvetica", 'value'
  | 'NUMBER'      // 10, 3.14
  | 'PERCENT'     // 50%
  | 'COLOR_HEX'   // #rgb, #rrggbb, #rrggbbaa
  | 'VAR'         // $varname
  | 'IDENTIFIER'  // mi-estilo, button-primary
  | 'SYMBOL'      // { } = ;
  | 'OPERATOR'    // + - * / %
  | 'COMMENT'     // /* ... */
  | 'WHITESPACE'
  | 'NEWLINE'
  | 'ERROR';

export interface StylesToken {
  type: StylesTokenType;
  value: string;
  line: number;
  column: number;
}

export interface StylesLexResult {
  tokens: StylesToken[];
  errors: LexError[];
}

// Reglas ordenadas por prioridad. Se toma la primera que coincida.
const RULES: Array<[RegExp, StylesTokenType]> = [
  // Espacios y saltos
  [/^\n/, 'NEWLINE'],
  [/^[ \t\r]+/, 'WHITESPACE'],

  // Comentarios de bloque
  [/^\/\*[\s\S]*?\*\//, 'COMMENT'],
  [/^\/\*[\s\S]*/, 'ERROR'],          // comentario no cerrado

  // Propiedades multi-palabra: los más largos primero para evitar match parcial.
  // border + subtipo
  [/^border[ \t]+top[ \t]+style(?![a-zA-Z0-9_-])/i,    'PROPERTY'],
  [/^border[ \t]+right[ \t]+style(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^border[ \t]+bottom[ \t]+style(?![a-zA-Z0-9_-])/i, 'PROPERTY'],
  [/^border[ \t]+left[ \t]+style(?![a-zA-Z0-9_-])/i,   'PROPERTY'],
  [/^border[ \t]+top(?![a-zA-Z0-9_-])/i,               'PROPERTY'],
  [/^border[ \t]+right(?![a-zA-Z0-9_-])/i,             'PROPERTY'],
  [/^border[ \t]+bottom(?![a-zA-Z0-9_-])/i,            'PROPERTY'],
  [/^border[ \t]+left(?![a-zA-Z0-9_-])/i,              'PROPERTY'],
  [/^border[ \t]+radius(?![a-zA-Z0-9_-])/i,            'PROPERTY'],
  [/^border[ \t]+style(?![a-zA-Z0-9_-])/i,             'PROPERTY'],
  [/^border[ \t]+width(?![a-zA-Z0-9_-])/i,             'PROPERTY'],
  [/^border[ \t]+color(?![a-zA-Z0-9_-])/i,             'PROPERTY'],
  // fondo, texto
  [/^background[ \t]+color(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^text[ \t]+align(?![a-zA-Z0-9_-])/i,         'PROPERTY'],
  [/^text[ \t]+size(?![a-zA-Z0-9_-])/i,          'PROPERTY'],
  [/^text[ \t]+font(?![a-zA-Z0-9_-])/i,          'PROPERTY'],
  // padding por lado
  [/^padding[ \t]+left(?![a-zA-Z0-9_-])/i,   'PROPERTY'],
  [/^padding[ \t]+top(?![a-zA-Z0-9_-])/i,    'PROPERTY'],
  [/^padding[ \t]+right(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^padding[ \t]+bottom(?![a-zA-Z0-9_-])/i, 'PROPERTY'],
  // margin por lado
  [/^margin[ \t]+left(?![a-zA-Z0-9_-])/i,   'PROPERTY'],
  [/^margin[ \t]+top(?![a-zA-Z0-9_-])/i,    'PROPERTY'],
  [/^margin[ \t]+right(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^margin[ \t]+bottom(?![a-zA-Z0-9_-])/i, 'PROPERTY'],
  // propiedades con guion
  [/^min-width(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^max-width(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^min-height(?![a-zA-Z0-9_-])/i, 'PROPERTY'],
  [/^max-height(?![a-zA-Z0-9_-])/i, 'PROPERTY'],

  // Keywords de estructura
  [/^@for(?![a-zA-Z0-9_-])/i,     'KEYWORD'],
  [/^extends(?![a-zA-Z0-9_-])/i,  'KEYWORD'],
  [/^from(?![a-zA-Z0-9_-])/i,     'KEYWORD'],
  [/^through(?![a-zA-Z0-9_-])/i,  'KEYWORD'],
  [/^to(?![a-zA-Z0-9_-])/i,       'KEYWORD'],

  // Propiedades simples (antes de IDENTIFIER)
  [/^height(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^width(?![a-zA-Z0-9_-])/i,   'PROPERTY'],
  [/^color(?![a-zA-Z0-9_-])/i,   'PROPERTY'],
  [/^padding(?![a-zA-Z0-9_-])/i, 'PROPERTY'],
  [/^margin(?![a-zA-Z0-9_-])/i,  'PROPERTY'],
  [/^border(?![a-zA-Z0-9_-])/i,  'PROPERTY'],

  // Valores multi-palabra (SANS SERIF antes de SANS)
  [/^sans[ \t]+serif(?![a-zA-Z0-9_-])/i, 'VALUE'],

  // Valores predefinidos de una palabra
  [/^center(?![a-zA-Z0-9_-])/i,    'VALUE'],
  [/^right(?![a-zA-Z0-9_-])/i,     'VALUE'],
  [/^left(?![a-zA-Z0-9_-])/i,      'VALUE'],
  [/^helvetica(?![a-zA-Z0-9_-])/i, 'VALUE'],
  [/^sans(?![a-zA-Z0-9_-])/i,      'VALUE'],
  [/^mono(?![a-zA-Z0-9_-])/i,      'VALUE'],
  [/^cursive(?![a-zA-Z0-9_-])/i,   'VALUE'],
  [/^dotted(?![a-zA-Z0-9_-])/i,    'VALUE'],
  [/^line(?![a-zA-Z0-9_-])/i,      'VALUE'],
  [/^double(?![a-zA-Z0-9_-])/i,    'VALUE'],
  [/^solid(?![a-zA-Z0-9_-])/i,     'VALUE'],
  [/^dashed(?![a-zA-Z0-9_-])/i,    'VALUE'],

  // Variables de bucle
  [/^\$[a-zA-Z_][a-zA-Z0-9_]*/, 'VAR'],

  // Número con porcentaje (antes del número simple)
  [/^[0-9]+(?:\.[0-9]+)?%/, 'PERCENT'],
  // Número entero o decimal
  [/^[0-9]+(?:\.[0-9]+)?/, 'NUMBER'],

  // Color hexadecimal: #rgb, #rrggbb, #rgba, #rrggbbaa
  [/^#[0-9a-fA-F]{3,8}/, 'COLOR_HEX'],

  // Cadenas de texto: "valor" o 'valor'
  [/^"([^"\\\n]|\\.)*"/, 'STRING'],
  [/^'([^'\\\n]|\\.)*'/, 'STRING'],

  // Identificador (con guiones internos: mi-estilo, btn-primary)
  [/^[a-zA-Z_][a-zA-Z0-9_-]*/, 'IDENTIFIER'],

  // Delimitadores
  [/^\{/, 'SYMBOL'],
  [/^\}/, 'SYMBOL'],
  [/^=/, 'SYMBOL'],
  [/^;/, 'SYMBOL'],
  [/^:/, 'SYMBOL'],

  // Operadores aritméticos
  [/^[+\-*/]/, 'OPERATOR'],
  [/^%/, 'OPERATOR'],  // % solitario (no precedido de dígito)

  // Cualquier otro carácter → error léxico
  [/^[\s\S]/, 'ERROR'],
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tokenizeStyles(input: string): StylesLexResult {
  const tokens: StylesToken[] = [];
  const errors: LexError[] = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  while (pos < input.length) {
    const remaining = input.slice(pos);

    for (const [regex, type] of RULES) {
      const m = regex.exec(remaining);
      if (!m) continue;

      const value = m[0];
      const col = pos - lineStart + 1;

      if (type === 'ERROR') {
        errors.push({
          lexeme:      value,
          line,
          column:      col,
          type:        'Léxico',
          description: `Símbolo no reconocido en .styles: "${value}"`,
        });
      }

      tokens.push({ type, value, line, column: col });

      // Actualizar número de línea según saltos en el token
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '\n') {
          line++;
          lineStart = pos + i + 1;
        }
      }

      pos += value.length;
      break;
    }
  }

  return { tokens, errors };
}

const STYLES_CLASS: Partial<Record<StylesTokenType, string>> = {
  KEYWORD:    'tok-keyword',
  PROPERTY:   'tok-property',
  VALUE:      'tok-string',
  STRING:     'tok-string',
  NUMBER:     'tok-number',
  PERCENT:    'tok-number',
  VAR:        'tok-number',
  IDENTIFIER: 'tok-identifier',
  SYMBOL:     'tok-symbol',
  OPERATOR:   'tok-operator',
  COMMENT:    'tok-comment',
  ERROR:      'tok-error',
};

export function highlightStyles(code: string): { html: string; errors: LexError[] } {
  const { tokens, errors } = tokenizeStyles(code);

  const html = tokens
    .map(tok => {
      const escaped = escapeHtml(tok.value);

      if (tok.type === 'NEWLINE')    return '\n';
      if (tok.type === 'WHITESPACE') return escaped;

      const cls = STYLES_CLASS[tok.type];
      return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
    })
    .join('');

  return { html, errors };
}

/**
 * Interpreta los tokens de styles y genera CSS.
 * Convierte reglas de YFERA styles a CSS válido.
 * Ejemplo: "TEXT { color: red; }" → ".TEXT { color: red; }"
 */
export function interpretStylesTokens(code: string): string {
  const { tokens } = tokenizeStyles(code);
  let css = '';
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    // Saltear espacios y saltos
    if (tok.type === 'WHITESPACE' || tok.type === 'NEWLINE') {
      i++;
      continue;
    }

    // Identificadores son selectores (SECTION, TEXT, etc.)
    if (tok.type === 'IDENTIFIER') {
      const selector = '.' + tok.value;
      i++;

      // Esperar { para iniciar el bloque
      while (i < tokens.length && (tokens[i].type === 'WHITESPACE' || tokens[i].type === 'NEWLINE')) {
        i++;
      }

      if (i < tokens.length && tokens[i].value === '{') {
        css += `\n${selector} {\n`;
        i++; // Saltear {

        // Leer propiedades hasta }
        let depth = 1;
        while (i < tokens.length && depth > 0) {
          const t = tokens[i];

          if (t.value === '{') depth++;
          else if (t.value === '}') {
            depth--;
            if (depth === 0) {
              css += '}\n';
              i++;
              break;
            }
          } else if (t.type !== 'WHITESPACE' && t.type !== 'NEWLINE') {
            css += t.value;
          } else if (t.type === 'WHITESPACE') {
            css += ' ';
          } else if (t.type === 'NEWLINE') {
            css += '\n';
          }

          i++;
        }
      }
    } else {
      i++;
    }
  }

  return css;
}
