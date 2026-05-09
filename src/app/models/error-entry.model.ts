export type ErrorType = 'Léxico' | 'Sintáctico' | 'Semántico';

export interface ErrorEntry {
  lexema: string;
  linea: number;
  columna: number;
  tipo: 'Léxico' | 'Sintáctico' | 'Semántico';
  descripcion: string;
  fileId?: string;
}