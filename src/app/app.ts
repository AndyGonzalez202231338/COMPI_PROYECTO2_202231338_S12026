import { Component, inject, viewChild, ElementRef, linkedSignal } from '@angular/core';
import { FileTree } from './components/file-tree/file-tree';
import { EditorComponent } from './components/editor/editor';
import { Preview } from './components/preview/preview';
import { ErrorPanel } from './components/error-panel/error-panel';
import { ColorPickerComponent } from './components/color-picker/color-picker';
import { SqlConsole } from './components/sql-console/sql-console';
import { FileSystemService } from './services/file-system.service';
import { ParserRunnerService } from './services/parser-runner.service';

type ColorEvent = { hex: string; rgb: string; hsl: string; alpha: number };

export type BottomTab = 'errors' | 'sql';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FileTree,
    EditorComponent,
    Preview,
    ErrorPanel,
    ColorPickerComponent,
    SqlConsole
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  private fs        = inject(FileSystemService);
  private runner    = inject(ParserRunnerService);
  private fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private editor    = viewChild(EditorComponent);

  activeBottomTab = linkedSignal<BottomTab>(() =>
    this.fs.activeFile()?.type === 'sql' ? 'sql' : 'errors'
  );

  switchTab(tab: BottomTab): void {
    this.activeBottomTab.set(tab);
  }

  newProject(): void {
    if (this.fs.tree().length > 0 && !confirm('¿Crear nuevo proyecto? Se perderán los cambios no guardados.')) return;
    this.fs.loadProject([]);
  }

  openProject(): void {
    this.fileInput()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const tree = JSON.parse(e.target?.result as string);
        this.fs.loadProject(tree);
      } catch {
        alert('El archivo no es un proyecto YFERA válido.');
      }
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  exportProject(): void {
    const json = this.fs.exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'proyecto-yfera.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  onColorSelected(event: ColorEvent): void {
    const text = event.alpha < 100
      ? `rgba(${event.rgb.slice(4, -1)}, ${(event.alpha / 100).toFixed(2)})`
      : event.hex;
    this.editor()?.insertAtCursor(text);
  }

  async run(): Promise<void> {
    await this.runner.runActive();
  }
}
