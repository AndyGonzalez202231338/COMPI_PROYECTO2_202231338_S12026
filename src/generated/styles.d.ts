// Type declarations for the Jison-generated styles.js (CommonJS)

export interface StylesJisonError {
  lexema: string;
  linea: number;
  columna: number;
  descripcion: string;
}

export interface StylesParseResult {
  ast: unknown[];
  lexicalErrors: StylesJisonError[];
  syntaxErrors: StylesJisonError[];
}

export declare function parse(input: string): StylesParseResult;
