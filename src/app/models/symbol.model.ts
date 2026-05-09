export type SymbolKind = 'style' | 'component' | 'variable' | 'function';
export type VarType = 'int' | 'float' | 'string' | 'boolean' | 'char'
                    | 'int[]' | 'float[]' | 'string[]' | 'boolean[]';

export interface Symbol {
  name: string;
  kind: string;
  type?: string;
  scope?: string;
  value?: unknown;
  line?: number;
  col?: number;
  fileOrigin?: string;
}