  import { Component, inject, viewChild, ElementRef, linkedSignal, ChangeDetectorRef } from '@angular/core';
  import { FileTree } from './components/file-tree/file-tree';
  import { EditorComponent } from './components/editor/editor';
  import { Preview } from './components/preview/preview';
  import { ErrorPanel } from './components/error-panel/error-panel';
  import { ColorPickerComponent } from './components/color-picker/color-picker';
  import { SqlConsole } from './components/sql-console/sql-console';
  import { FileSystemService } from './services/file-system.service';
  import { ParserRunnerService } from './services/parser-runner.service';
  import { CodegenService } from './services/codegen.service';
  import { SymbolTableService } from './services/symbol-table.service';
  import { NgZone } from '@angular/core';


  import { FileNode, FileType } from './models/file-node.model';
  import JSZip from 'jszip';

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
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
  })
  export class AppComponent {
    private fs        = inject(FileSystemService);
    private runner    = inject(ParserRunnerService);
    private codegen   = inject(CodegenService);
    private symbols   = inject(SymbolTableService);
    private fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
    private editor    = viewChild(EditorComponent);
    private zone = inject(NgZone);
    private cdr = inject(ChangeDetectorRef);

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

    async onFileSelected(event: Event): Promise<void> {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      await this.fs.importProjectZip(file);
      (event.target as HTMLInputElement).value = '';
    }

    exportProject(): void {
      this.fs.exportProjectZip();
    }

    exportSymbolTable(): void {
      const list = [...this.symbols.symbols().values()];
      const html = this.codegen.buildSymbolTableHtml(list, 'Tabla de símbolos');
      this.codegen.download(html, `${this.fs.projectName()}-tabla-simbolos.html`, 'text/html');
    }

    onColorSelected(event: ColorEvent): void {
      const text = event.alpha < 100
        ? `rgba(${event.rgb.slice(4, -1)}, ${(event.alpha / 100).toFixed(2)})`
        : event.hex;
      this.editor()?.insertAtCursor(text);
    }

    async run(): Promise<void> {
  await this.runner.runActive();
  this.cdr.detectChanges();
}
  }
