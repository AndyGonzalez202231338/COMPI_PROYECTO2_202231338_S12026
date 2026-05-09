import { Injectable, signal } from '@angular/core';

export interface ColorResult {
  hex: string;
  rgb: string;
  hsl: string;
  alpha: number;
  selectedToken?: string; // Token en el editor a reemplazar
}

@Injectable({
  providedIn: 'root',
})
export class ColorPickerService {
  // Signal para almacenar el último color seleccionado
  lastSelectedColor = signal<ColorResult | null>(null);

  // Signal para controlar apertura remota del picker
  triggerOpen = signal(false);

  // Métodos para almacenar el color
  setSelectedColor(color: ColorResult): void {
    this.lastSelectedColor.set(color);
  }

  getSelectedColor(): ColorResult | null {
    return this.lastSelectedColor();
  }

  // Trigger para abrir el picker desde cualquier lado
  openColorPicker(): void {
    this.triggerOpen.set(true);
  }
}