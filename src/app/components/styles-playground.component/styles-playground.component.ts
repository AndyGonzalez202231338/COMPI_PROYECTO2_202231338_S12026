import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { StylesInterpreterService, StylesParserResult } from '../../services/styles-interpreter.service';
import { ErrorReporterService } from '../../services/error-reporter.service';
import { SymbolTableService }   from '../../services/symbol-table.service';
import { ErrorEntry }           from '../../models/error-entry.model';

@Component({
  selector:    'app-styles-playground',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './styles-playground.component.html',
  styleUrls:   ['./styles-playground.component.css'],
})
export class StylesPlaygroundComponent implements OnInit {

  /** Código fuente .styles que el usuario escribe */
  sourceCode: string = `mi-clase {
  height = 100;
  width = 80%;
  background color = lightgray;
  color = blue;
  text size = 14;
  padding = 10;
  border radius = 8;
}

super-estilo {
  background color = lightgray;
  color = red;
}

mi-derivado extends super-estilo {
  color = blue;
  border = 2 solid red;
}

@for $i from 1 through 4 {
  my-font-$i {
    text size = $i * 10;
    padding = $i + 5;
  }
}`;

  /** CSS generado tras la compilación */
  cssOutput: string = '';

  /** Errores recolectados (léxicos + sintácticos + semánticos) */
  errors: ErrorEntry[] = [];

  /** AST en JSON para inspección */
  astOutput: string = '';

  /** HTML sanitizado para el iframe de vista previa */
  previewHtml: SafeHtml | null = null;

  /** Estado de carga del parser */
  parserReady: boolean = false;
  parserError: string  = '';

  /** Referencia al parser Jison cargado dinámicamente */
  private parser: any = null;

  constructor(
    private interpreter: StylesInterpreterService,
    private er:          ErrorReporterService,
    private st:          SymbolTableService,
    private sanitizer:   DomSanitizer,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadParser();
  }

  /** Carga el parser Jison desde /assets/parsers/styles-parser.js */
  private async loadParser(): Promise<void> {
    try {
      const res = await fetch('/assets/parsers/styles-parser.js');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const src = await res.text();
      // El wrapper expone `parser` al final del script
      // eslint-disable-next-line no-new-func
      const fn = new Function(src + '\nreturn parser;');
      this.parser = fn();
      this.parserReady = true;
    } catch (e: any) {
      this.parserError = `No se pudo cargar el parser: ${e.message}. Ejecuta: npm run build:parsers`;
    }
  }

  /** Dispara el análisis del código fuente */
  compile(): void {
    if (!this.parserReady) {
      this.parserError = 'El parser aún no está listo';
      return;
    }

    // Limpiar estado previo
    this.er.clearAll();
    this.st.clearAll();
    this.cssOutput = '';
    this.astOutput = '';

    try {
      // Jison hace TODO el análisis (léxico + sintáctico + AST)
      const result: StylesParserResult = this.parser.parse(this.sourceCode);

      // Mostrar el AST en formato JSON (útil para depurar la gramática)
      this.astOutput = JSON.stringify(result.ast, null, 2);

      // Pasar el AST al intérprete que produce CSS y registra errores semánticos
      this.cssOutput = this.interpreter.interpret(result, 'playground.styles');

      // Recoger los errores que el intérprete registró
      this.errors = [...this.er.errors()];

      // Construir vista previa con el CSS generado
      this.previewHtml = this.buildPreview(result.ast, this.cssOutput);

    } catch (e: any) {
      // Sólo errores fatales no recuperables llegan aquí
      this.errors = [{
        lexema:      e.hash?.text ?? '?',
        linea:       e.hash?.loc?.first_line   ?? 0,
        columna:     e.hash?.loc?.first_column ?? 0,
        tipo:        'Sintáctico',
        descripcion: `Error fatal: ${e.message}`,
        fileId:      'playground.styles',
      }];
    }
  }

  /** Limpia todo */
  reset(): void {
    this.sourceCode  = '';
    this.cssOutput   = '';
    this.astOutput   = '';
    this.previewHtml = null;
    this.errors      = [];
    this.er.clearAll();
    this.st.clearAll();
  }

  private buildPreview(ast: any[], css: string): SafeHtml {
    const classes = ast
      .filter(n => n.type === 'StyleDeclaration')
      .map(n => n.name as string);

    const cards = classes.map(name =>
      `<div class="preview-card ${name}"><span class="label">.${name}</span></div>`
    ).join('\n');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    background: #1e1e1e;
    font-family: 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;
  }
  .preview-card {
    min-width: 120px; min-height: 60px;
    padding: 12px; border-radius: 4px;
    position: relative;
  }
  .label {
    display: block; font-size: 10px;
    background: rgba(0,0,0,.45); color: #fff;
    padding: 2px 6px; border-radius: 2px;
    position: absolute; top: 4px; left: 4px;
    font-family: monospace; pointer-events: none;
  }
  ${css}
</style></head><body>${cards}</body></html>`;

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /** Carga un ejemplo predefinido */
  loadExample(): void {
    this.sourceCode = `boton-primario {
  background color = blue;
  color = white;
  padding = 12;
  border radius = 4;
  text size = 14;
}

boton-secundario extends boton-primario {
  background color = lightgray;
  color = blue;
  border = 1 solid blue;
}

@for $i from 1 through 3 {
  margen-$i {
    margin = $i * 8;
    padding = $i * 4;
  }
}`;
  }
}