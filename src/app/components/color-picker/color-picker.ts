import { Component, signal, computed, output } from '@angular/core';

interface ColorHistory {
  hex: string;
  rgb: string;
}

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [],
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.css',
})
export class ColorPickerComponent {

  isOpen      = signal(false);
  selectedHex = signal('#FF0000');
  selectedAlpha = signal(100);
  colorHistory  = signal<ColorHistory[]>([]);

  // Derived values via computed — no side-effects needed
  selectedRgb = computed(() => {
    const rgb = this.hexToRgb(this.selectedHex());
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  });

  selectedHsl = computed(() => {
    const hsl = this.rgbToHsl(this.hexToRgb(this.selectedHex()));
    return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  });

  currentHsl = computed(() => this.parseHsl(this.selectedHsl()));

  colorSelected = output<{ hex: string; rgb: string; hsl: string; alpha: number }>();

  cssColors = [
    { name: 'Red',     hex: '#FF0000' },
    { name: 'Green',   hex: '#00AA00' },
    { name: 'Blue',    hex: '#0000FF' },
    { name: 'Yellow',  hex: '#FFFF00' },
    { name: 'Orange',  hex: '#FFA500' },
    { name: 'Purple',  hex: '#800080' },
    { name: 'Pink',    hex: '#FFC0CB' },
    { name: 'Cyan',    hex: '#00FFFF' },
    { name: 'Magenta', hex: '#FF00FF' },
    { name: 'Lime',    hex: '#00FF00' },
    { name: 'Navy',    hex: '#000080' },
    { name: 'Teal',    hex: '#008080' },
  ];

  togglePanel(): void { this.isOpen.update(v => !v); }
  closePanel():  void { this.isOpen.set(false); }

  onNativeColorChange(event: Event): void {
    this.selectedHex.set((event.target as HTMLInputElement).value);
  }

  onHexInputChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) this.selectedHex.set(val);
  }

  onHueChange(event: Event): void {
    const hue = +(event.target as HTMLInputElement).value;
    const hsl = this.currentHsl();
    this.selectedHex.set(this.rgbToHex(this.hslToRgb(hue, hsl.s, hsl.l)));
  }

  onSaturationChange(event: Event): void {
    const sat = +(event.target as HTMLInputElement).value;
    const hsl = this.currentHsl();
    this.selectedHex.set(this.rgbToHex(this.hslToRgb(hsl.h, sat, hsl.l)));
  }

  onLightnessChange(event: Event): void {
    const light = +(event.target as HTMLInputElement).value;
    const hsl = this.currentHsl();
    this.selectedHex.set(this.rgbToHex(this.hslToRgb(hsl.h, hsl.s, light)));
  }

  onAlphaChange(event: Event): void {
    this.selectedAlpha.set(+(event.target as HTMLInputElement).value);
  }

  selectCssColor(hex: string): void { this.selectedHex.set(hex); }

  selectFromHistory(hex: string): void { this.selectedHex.set(hex); }

  applyColor(): void {
    this.addToHistory(this.selectedHex());
    this.colorSelected.emit({
      hex:   this.selectedHex(),
      rgb:   this.selectedRgb(),
      hsl:   this.selectedHsl(),
      alpha: this.selectedAlpha(),
    });
    this.closePanel();
  }

  cancel(): void { this.closePanel(); }

  copyHex(): void { navigator.clipboard.writeText(this.selectedHex()); }

  previewBg(): string {
    return this.selectedHex();
  }

  previewOpacity(): number {
    return this.selectedAlpha() / 100;
  }

  private addToHistory(hex: string): void {
    const h = this.colorHistory();
    if (!h.find(c => c.hex === hex)) {
      this.colorHistory.set([{ hex, rgb: this.selectedRgb() }, ...h].slice(0, 6));
    }
  }

  // ── Color math helpers ──────────────────────────────────────

  hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : { r: 0, g: 0, b: 0 };
  }

  rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
    const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360; s /= 100; l /= 100;
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
      g: Math.round(hue2rgb(p, q, h)       * 255),
      b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
    };
  }

  rgbToHex(rgb: { r: number; g: number; b: number }): string {
    return '#' + [rgb.r, rgb.g, rgb.b]
      .map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  }

  private parseHsl(s: string): { h: number; s: number; l: number } {
    const m = s.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    return m ? { h: +m[1], s: +m[2], l: +m[3] } : { h: 0, s: 0, l: 0 };
  }
}
