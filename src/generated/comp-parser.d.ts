// Type declarations for the Jison-generated comp-parser.js (CommonJS)
export interface ParseToken {
  type: string;
  value: string;
  line: number;
  col: number;
}

export interface ParseError {
  lexeme: string;
  line: number;
  col: number;
  type: string;
  description: string;
}

export interface CompParseResult {
  tokens: ParseToken[];
  lexErrors: ParseError[];
  syntaxErrors: ParseError[];
  ast: unknown;
}

export declare function parse(input: string, stylesCtx?: Record<string, boolean>): CompParseResult;
export declare function registerStyles(map: Record<string, boolean>): void;
export declare function getResults(): CompParseResult;
export declare const parser: { parse(input: string): unknown };
