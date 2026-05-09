// Type declarations for the Jison-generated sql-parser.js (CommonJS)

export interface SqlToken {
  type: string;
  value: string;
  line: number;
  col: number;
}

export interface SqlParseError {
  lexeme: string;
  line: number;
  col: number;
  type: string;
  description: string;
}

export type SqlStmtType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP';

export interface SqlParseResult {
  ok: boolean;
  type: SqlStmtType | null;
  ast: unknown;
  tokens: SqlToken[];
  lexErrors: SqlParseError[];
  syntaxErrors: SqlParseError[];
}

export declare function parse(input: string): SqlParseResult;
export declare function getResults(): SqlParseResult;
export declare const parser: { parse(input: string): unknown };
