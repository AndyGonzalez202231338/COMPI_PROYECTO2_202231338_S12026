export interface ParserToken {
  type: string;
  value: any;
  line: number;
  column: number;
}

export interface LexicalError {
  line: number;
  column: number;
  lexeme: string;
  type: string;
  description: string;
}

export interface SyntaxError {
  line: number;
  column: number;
  message: string;
  expected?: string[];
}

export interface ASTNode {
  type: string;
  [key: string]: any;
}

export interface ParserResult {
  ast: ASTNode | null;
  tokens: ParserToken[];
  lexicalErrors: LexicalError[];
  syntaxErrors: SyntaxError[];
}

export interface YParser {
  parse(input: string): void;
  _reset(): void;
  _getAST(): ASTNode | null;
  _getTokens(): ParserToken[];
  _getLexicalErrors(): LexicalError[];
  _getSyntaxErrors(): SyntaxError[];
  yy: {
    parseError(str: string, hash: any): void;
  };
}

declare const yParser: YParser;

export default yParser;
