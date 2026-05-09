import { Injectable, signal, computed } from '@angular/core';
import { ErrorEntry } from '../models/error-entry.model';

@Injectable({ providedIn: 'root' })
export class ErrorReporterService {
  private errorList = signal<ErrorEntry[]>([]);
  
  readonly errorSignal = this.errorList.asReadonly();
  readonly errorCount = computed(() => this.errorList().length);

  constructor() {}

  /**
   * Añade un error a la lista
   */
  add(error: ErrorEntry): void {
    const currentErrors = this.errorList();
    
    // Evitar duplicados
    const exists = currentErrors.some(e =>
      e.lexema === error.lexema &&
      e.linea === error.linea &&
      e.columna === error.columna &&
      e.fileId === error.fileId
    );

    if (!exists) {
      this.errorList.set([...currentErrors, error]);
    }
  }

  /**
   * Limpia errores de un archivo específico
   */
  clearFileErrors(fileId?: string): void {
    if (!fileId) {
      this.errorList.set([]);
      return;
    }
    const filtered = this.errorList().filter(e => e.fileId !== fileId);
    this.errorList.set(filtered);
  }

  /**
   * Limpia todos los errores
   */
  clearAll(): void {
    this.errorList.set([]);
  }

  /**
   * Obtiene todos los errores (para retornar en RunResult)
   */
  errors(): ErrorEntry[] {
    return this.errorList();
  }

  /**
   * Obtiene errores de un archivo específico
   */
  getFileErrors(fileId: string): ErrorEntry[] {
    return this.errorList().filter(e => e.fileId === fileId);
  }
}