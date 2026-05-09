import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FileSystemService } from './file-system.service';
import { SymbolTableService } from './symbol-table.service';
import { ErrorReporterService } from './error-reporter.service';
import { StylesInterpreterService, StylesParserResult } from './styles-interpreter.service';
import { ErrorEntry } from '../models/error-entry.model';
import * as StylesParser from '../../generated/styles';
import * as CompParser from '../../generated/comp-parser';
import * as YParser from '../../generated/y-parser';
import * as SqlParser from '../../generated/sql-parser';

export interface RunResult {
  html: string;
  css: string;
  errors: ErrorEntry[];
}

interface Scope {
  vars: Record<string, unknown>;
  parent: Scope | null;
}

@Injectable({ providedIn: 'root' })
export class ParserRunnerService {

  private fs           = inject(FileSystemService);
  private st           = inject(SymbolTableService);
  private er           = inject(ErrorReporterService);
  private stylesInterp = inject(StylesInterpreterService);
  private http         = inject(HttpClient);
  private insideTableContext = false;

  private carouselCounter = 0;
  private executeCache = new Map<string, unknown>();
  private userFunctions = new Map<string, any>();

  readonly lastResult = signal<RunResult | null>(null);

  private refreshRequested = new Subject<void>();
  readonly refresh$ = this.refreshRequested.asObservable();

  async runActive(): Promise<void> {
  console.log('runActive called');
  const allFiles = this.fs.flatList();
  let mainFile = allFiles.find(f => f.type === 'y' && f.path.endsWith('main.y'));
  if (!mainFile) mainFile = allFiles.find(f => f.type === 'y');
  if (!mainFile) return;
  
  await this.run(mainFile.id);
 
}

  async run(mainFileId: string): Promise<RunResult> {
  this.er.clearAll();
  this.st.clearAll();
  this.executeCache.clear();
  this.userFunctions.clear();

  const file = this.fs.findById(mainFileId);
  if (!file || file.type !== 'y') {
    const result = { html: '', css: '', errors: [] };
    this.lastResult.set(result);
    return result;
  }

  const allFiles = this.fs.flatList();
  const pathMap  = this.fs.getPathMap();
  let css = '';
  let html = '';

  try {
    const mainAst = this.safeparse(YParser, file.content, mainFileId);
    console.log('AST del main:', JSON.stringify(mainAst, null, 2));
    if (!mainAst) {
      const result = { html, css, errors: this.er.errors() };
      this.lastResult.set(result);
      return result;
    }

    const programBody: any[] = (mainAst as any).body ?? [];

    const imports = programBody
      .filter((n: any) => n.type === 'Import')
      .map((n: any) => {
        let path = String(n.path);
        path = path.replace(/^["'\\]|["'\\]$/g, '');
        path = path.replace(/\\"/g, '"');
        path = path.replace(/^["']|["']$/g, '');
        return path;
      });

    const stylesImports = imports.filter(p => {
      const ends = p.endsWith('.styles');
      console.debug('[run] checking:', p, '→ ends with .styles:', ends);
      return ends;
    });

    for (const importPath of stylesImports) {
      const content = this.resolveImport(importPath, pathMap);
      if (content === undefined) {
        this.er.add({
          lexema: importPath, linea: 0, columna: 0,
          tipo: 'Semántico',
          descripcion: `Import no encontrado: ${importPath}`,
          fileId: mainFileId
        });
        continue;
      }
      const stylesFileId = allFiles.find(f => f.path === importPath)?.id ?? importPath;
      try {
        const raw = StylesParser.parse(content) as any;
        const parsed: StylesParserResult = {
          ast:           raw.ast           ?? [],
          lexicalErrors: raw.lexicalErrors ?? [],
          syntaxErrors:  raw.syntaxErrors  ?? [],
        };
        css += this.stylesInterp.interpret(parsed, stylesFileId);
      } catch (e: any) {
        this.er.add({
          lexema: '?', linea: 0, columna: 0,
          tipo: 'Sintáctico',
          descripcion: `Error al parsear styles: ${e.message}`,
          fileId: stylesFileId
        });
      }
    }

    const stylesMap: Record<string, boolean> = {};
    for (const name of this.st.styleNames()) stylesMap[name] = true;
    CompParser.registerStyles(stylesMap);

    for (const importPath of imports.filter(p => p.endsWith('.comp'))) {
      const content = this.resolveImport(importPath, pathMap);
      if (content === undefined) {
        this.er.add({
          lexema: importPath, linea: 0, columna: 0,
          tipo: 'Semántico',
          descripcion: `Import no encontrado: ${importPath}`,
          fileId: mainFileId
        });
        continue;
      }
      const compFileId = allFiles.find(f => f.path === importPath)?.id ?? importPath;
      const compAst = this.safeparse(CompParser, content, compFileId);
      if (compAst) this.registerComponents(compAst, compFileId);
    }

    // Registrar funciones de usuario
    for (const node of programBody) {
      if (node?.type === 'FunctionDecl' && node.name) {
        this.userFunctions.set(node.name, node);
      }
    }

    // Pre-fetch executes
    await this.prefetchExecutes(programBody);

    const mainNode = programBody.find((n: any) => n.type === 'Main');
    if (mainNode) {
      await this.prefetchExecutes(mainNode.body ?? []);
    }

    for (const fn of this.userFunctions.values()) {
      await this.prefetchExecutes(fn.body ?? []);
    }

    html = await this.interpretMain(mainAst, mainFileId);
    console.log('[run] Errores después de interpretMain:', this.er.errors());
    console.log('[run] Total errores:', this.er.errors().length);

  } catch (e: any) {
    this.er.add({
      lexema: '?', linea: 0, columna: 0,
      tipo: 'Sintáctico',
      descripcion: `Error inesperado: ${e.message}`,
      fileId: mainFileId
    });
  }

  
  // en parser-runner.service.ts — al final de run()
  console.log('[run] SET lastResult con', this.er.errors().length, 'errores');
  const result: RunResult = { html, css, errors: this.er.errors() };
  this.lastResult.set(result);
  return result
  }

  runSql(code: string, fileId: string): unknown {
    return this.safeparse(SqlParser as any, code, fileId);
  }

  // ── Execute pre-fetch ─────────────────────────────────────────────────────

  /** Escanea statements del main y pre-carga todos los execute estáticos. */
  private async prefetchExecutes(stmts: any[]): Promise<void> {
    for (const stmt of stmts ?? []) {
      if (!stmt) continue;

      // Caso 1: VariableDeclaration con init Execute
      if (stmt.type === 'VariableDeclaration' && stmt.init?.type === 'Execute') {
        const query = stmt.init.query;
        const varName = stmt.name;
        
        console.log('[prefetch] VarDecl Execute:', varName, 'query:', query);
        
        // [FIX] Guardar con AMBAS claves: query Y nombre de variable
        const result = await this.fetchExecute(query);
        console.log('[prefetch] fetchExecute returned:', result);
        
        this.executeCache.set(query, result);  // Clave 1: query con backticks
        this.executeCache.set(varName, result); // Clave 2: nombre de variable
        console.log('[prefetch] Cached varName=', varName, 'result=', result);
        console.log('[prefetch] Cache now has:', Array.from(this.executeCache.keys()));
      }

      // Caso 2: Execute statement (sin $)
      if (stmt.type === 'Execute') {
        const hasDollar = stmt.query && stmt.query.includes('$');
        if (!hasDollar) {
          console.log('[prefetch] Execute statement without $:', stmt.query);
          await this.cacheExecute(stmt.query, {});
        }
      }

      // Escanear recursivamente bloques internos
      const nestedBody = stmt.thenBody ?? stmt.body ?? stmt.elseBody ?? null;
      if (Array.isArray(nestedBody)) {
        await this.prefetchExecutes(nestedBody);
      }
    }
  }

  private async cacheExecute(query: string, _vars: Record<string, unknown>): Promise<void> {
    console.log('[cacheExecute] called with query:', query);
    if (this.executeCache.has(query)) return;
    const result = await this.fetchExecute(query);
    this.executeCache.set(query, result);
  }

  /** Parsea la query SQL YFERA, la envía al backend y devuelve el resultado. */
private async fetchExecute(rawQuery: string): Promise<unknown> {
  console.log('[fetchExecute] rawQuery:', rawQuery);

  
  const cleanQuery = rawQuery.replace(/^`|`$/g, '');
  console.log('[fetchExecute] cleanQuery:', cleanQuery);

  let parseResult: any;
  try {
    // Resetear el parser
    (SqlParser as any).parser._reset?.();

    // Parsear la query
    (SqlParser as any).parse(cleanQuery);

  
    const ast = (SqlParser as any).parser._getAST?.();
    const lexErrors = (SqlParser as any).parser._getLexicalErrors?.() || [];
    const syntaxErrors = (SqlParser as any).parser._getSyntaxErrors?.() || [];

    parseResult = {
      ast: ast || [],
      tokens: (SqlParser as any).parser._getTokens?.() || [],
      lexErrors,
      syntaxErrors
    };
    console.log('[fetchExecute] parseResult AST:', JSON.stringify(parseResult.ast, null, 2));
  } catch (err) {
    console.error('[fetchExecute] parse exception:', err);
    // Aún así, forzar el nodo visual
    this.fs.ensureDbNode(this.fs.projectName());
    return null;
  }
  const hasErrors = (parseResult?.lexErrors?.length ?? 0) > 0 || (parseResult?.syntaxErrors?.length ?? 0) > 0;
  if (!parseResult?.ast || hasErrors) {
    console.warn('[fetchExecute] AST inválido o errores', parseResult?.lexErrors, parseResult?.syntaxErrors);
    this.fs.ensureDbNode(this.fs.projectName());
    return null;
  }

  const statements: any[] = Array.isArray(parseResult.ast) ? parseResult.ast : [parseResult.ast];
  const project = this.fs.projectName();

  let lastResult: unknown = null;
  let allRows: any[] = [];

  for (const stmt of statements) {
    if (!stmt || !stmt.type) continue;
    
    this.fs.ensureDbNode(this.fs.projectName());

    try {
      const response: any = await firstValueFrom(
        this.http.post('http://localhost:3000/api/sql/execute', { ast: stmt, project })
      );
      console.log('[fetchExecute] response:', response);

      if (!response.success) {
        console.warn('[fetchExecute] backend error:', response.error);
        continue;
      }

      if (response.data?.created || response.data?.already) {
        console.log('[fetchExecute] created/already:', response.data);
      }

      if (response.data?.rows) {
        allRows = allRows.concat(response.data.rows);
      }
      lastResult = response.data?.message ?? true;
    } catch (err) {
      console.error('[fetchExecute] HTTP error:', err);
    }
  }

  return allRows.length ? allRows : lastResult;
}

    private resolveImport(importPath: string, pathMap: Map<string, string>): string | undefined {
      let content = pathMap.get(importPath);
      if (content !== undefined) return content;
      const bare = importPath.replace(/^\.\//, '');
      content = pathMap.get(bare);
      if (content !== undefined) return content;
      content = pathMap.get('./' + bare);
      if (content !== undefined) return content;
      for (const [key, val] of pathMap) {
        if (key.endsWith('/' + bare) || key === './' + bare) return val;
      }
      return undefined;
    }

    private safeparse(parser: any, input: string, fileId: string): unknown | null {
      try {
        let parseReturn: any;
        if (typeof parser.parseComp === 'function') {
          parseReturn = parser.parseComp(input);
        } else {
          if (parser.parser?._reset) parser.parser._reset();
          parseReturn = parser.parse(input) as any;
        }

        let result: any;
        if (parseReturn && typeof parseReturn === 'object' && 'ast' in parseReturn) {
          result = parseReturn;
        } else if (typeof parser.getResults === 'function') {
          result = parser.getResults();
        } else if (typeof parser.parser?._getResults === 'function') {
          result = parser.parser._getResults();
        } else {
          result = parseReturn;
        }

        if (result && typeof result === 'object' && 'ast' in result) {
          const lexErrs: any[] = result['lexErrors'] ?? result['lexicalErrors'] ?? [];
          const synErrs: any[] = result['syntaxErrors'] ?? [];

          for (const e of lexErrs) {
            this.er.add({
              lexema: e.lexeme ?? e.lexema ?? '?',
              linea:  e.line   ?? e.linea  ?? 0,
              columna: e.col   ?? e.columna ?? 0,
              tipo: 'Léxico', descripcion: e.description ?? e.descripcion ?? '',
              fileId,
            });
          }
          for (const e of synErrs) {
            const tipo: ErrorEntry['tipo'] =
              e.type === 'Semantico' ? 'Semántico' : 'Sintáctico';
            this.er.add({
              lexema: e.lexeme ?? e.lexema ?? '?',
              linea:  e.line   ?? e.linea  ?? 0,
              columna: e.col   ?? e.columna ?? 0,
              tipo, descripcion: e.description ?? e.descripcion ?? '',
              fileId,
            });
          }
          return (result['ast'] as unknown) ?? null;
        }

        return result as unknown;
      } catch (e: any) {
        let partial: any = null;
        if (typeof parser.getResults === 'function') partial = parser.getResults();
        else if (typeof parser.parser?._getResults === 'function') partial = parser.parser._getResults();

        if (partial?.ast) return partial.ast as unknown;

        const loc = e.hash?.loc ?? { first_line: 0, first_column: 0 };
        this.er.add({
          lexema: e.hash?.text ?? '?',
          linea: loc.first_line, columna: loc.first_column,
          tipo: e.hash ? 'Sintáctico' : 'Léxico',
          descripcion: e.message, fileId,
        });
        return null;
      }
    }


    private registerComponents(ast: unknown, fileOrigin: string): void {
      const prog = ast as { type: string; body: any[] };
      for (const node of (prog?.body ?? [])) {
        if (node?.type !== 'ComponentDecl' || !node.name) continue;
        this.st.define({ name: node.name, kind: 'component', fileOrigin, value: node });
      }
    }

    private async interpretMain(ast: unknown, fileOrigin: string): Promise<string> {
      const prog = ast as { type: string; body: any[] };
      const mainNode = (prog?.body ?? []).find((n: any) => n.type === 'Main');
      if (!mainNode) return '';

      const globalScope = await this.buildGlobalScope(prog.body);
      const innerHtml = this.execStmts(mainNode.body ?? [], globalScope, fileOrigin);

      const executeVars = this.collectExecuteVarNames(prog.body);

      return `
        <div style="box-sizing:border-box;display:flex;flex-direction:column;gap:20px;align-items:stretch;width:100%;">
          <style>* { box-sizing: border-box; }</style>
          ${innerHtml}
        </div>
        ${this.generateInitScript(executeVars)}
      `;
    }

    private collectExecuteVarNames(body: any[]): string[] {
      return body
        .filter(n => n?.type === 'VariableDeclaration' && n.init?.type === 'Execute')
        .map(n => n.name);
    }

    private collectExecuteStatements(body: any[]): Array<{ name: string; ast: any }> {
      const stmts: Array<{ name: string; ast: any }> = [];
      for (const node of body) {
        if (node?.type === 'VariableDeclaration' && node.init?.type === 'Execute') {
          console.log('[collectExecuteStatements] Execute node:', JSON.stringify(node.init, null, 2));
          
          // Parsear la query para obtener el AST real
          const query = node.init.query;
          const cleanQuery = query.replace(/^`|`$/g, ''); // Eliminar backticks
          
          let parsedAst: any = null;
          try {
            (SqlParser as any).parser._reset?.();
            (SqlParser as any).parse(cleanQuery);
            let ast = (SqlParser as any).parser._getAST?.();
            parsedAst = Array.isArray(ast) ? ast[0] : ast;
            
            // [FIX] Normalizar column → columns
            if (parsedAst && parsedAst.type === 'SELECT' && parsedAst.column) {
              parsedAst.columns = [parsedAst.column];
              delete parsedAst.column;
            }
            
            console.log('[collectExecuteStatements] Parsed AST:', JSON.stringify(parsedAst, null, 2));
          } catch (err) {
            console.error('[collectExecuteStatements] Parse error:', err);
            continue;
          }
          
          if (parsedAst && parsedAst.type) {  // ← Verifica que sea un AST válido
            stmts.push({ name: node.name, ast: parsedAst });
          }
        }
      }
      console.log('[collectExecuteStatements] Final stmts:', JSON.stringify(stmts, null, 2));
      return stmts;
    }

    private generateInitScript(varNames: string[]): string {
      if (varNames.length === 0) return '';
      
      const project = this.fs.projectName();
      
      // [FIX] Construir statements a partir del executeCache usando nombres de variables
      const stmts: Array<{ name: string; data: any[] }> = [];
      for (const varName of varNames) {
        // Intentar primero con el nombre directo
        let cached = this.executeCache.get(varName);
        
        if (!cached) {
          // Si no, intentar con backticks
          cached = this.executeCache.get(`\`${varName}\``);
        }
        
        if (Array.isArray(cached) && cached.length > 0) {
          stmts.push({ name: varName, data: cached });
          console.log('[generateInitScript] Added', varName, ':', cached);
        }
      }

      const stmtsJson = JSON.stringify(stmts);

      return `<script>
        window.yferaData    = {};
        window.yferaProject = '${project}';
        
        // [FIX] Definir renderPokemonList AQUÍ, ANTES de yferaLoad
        window.renderPokemonList = function(containerId) {
          return function() {
            const nombres = window.yferaData.nombres || [];
            const hps = window.yferaData.hps || [];
            const niveles = window.yferaData.niveles || [];
            
            console.log('[renderPokemonList] nombres:', nombres, 'hps:', hps, 'niveles:', niveles);
            
            let html = '';
            if (nombres.length === 0) {
              html = '<div style="width: 100%; padding: 16px; text-align: center; color: #999;">No hay pokemon registrados aun.</div>';
            } else {
              for (let i = 0; i < nombres.length; i++) {
                html += \`
                  <div style="border: 1px solid #ccc; padding: 12px; border-radius: 4px; min-width: 200px;">
                    <div style="font-weight: bold; font-size: 16px;">\${nombres[i]}</div>
                    <div style="color: #666; margin-top: 8px;">HP: \${hps[i]} | Nivel: \${niveles[i]}</div>
                    <div style="color: #999; font-size: 12px; margin-top: 4px;">ID: \${i + 1}</div>
                  </div>
                \`;
              }
            }
            
            const container = document.getElementById(containerId);
            if (container) {
              container.innerHTML = html;
              console.log('[renderPokemonList] container relleno');
            }
          };
        };

        window.yferaLoad = async function() {
          console.log('[yferaLoad] iniciando...');
          const stmts = ${stmtsJson};
          console.log('[yferaLoad] stmts:', stmts);
          
          // [FIX] Si ya tenemos datos del cache (pre-fetched), usarlos directamente
          for (const { name, data } of stmts) {
            if (data && data.length > 0) {
              window.yferaData[name] = data.map(r => Object.values(r)[0]);
              console.log('[yferaLoad] From cache:', name, '→', window.yferaData[name]);
            }
          }
          
          // Renderizar contenedores dinámicos si existen
          document.querySelectorAll('[id^="pokemon-list-container-"]').forEach(el => {
            window.renderPokemonList(el.id)();
          });
        };

        document.addEventListener('DOMContentLoaded', window.yferaLoad);
      </script>`;
    }

    private async buildGlobalScope(body: any[]): Promise<Scope> {
      const scope: Scope = { vars: {}, parent: null };

      for (const node of (body ?? [])) {
        if (node?.type !== 'VariableDeclaration' || !node.name) continue;

        if (node.init?.type === 'Execute') {
          const cached = await this.resolveExecuteValue(node.name, node.init.query);
          scope.vars[node.name] = Array.isArray(cached)
            ? cached.map((row: any) => Object.values(row)[0])
            : cached ?? [];
          continue;
        }

        scope.vars[node.name] = this.evalExpr(node.init, scope);
      }

      return scope;
    }

    private execStmts(stmts: any[], scope: Scope, fileOrigin: string): string {
      return (stmts ?? []).map(s => this.execStmt(s, scope, fileOrigin)).join('');
    }

    private execStmt(stmt: any, scope: Scope, fileOrigin: string): string {
      if (!stmt) return '';
      switch (stmt.type) {
        case 'VariableDeclaration':
          scope.vars[stmt.name] = this.evalExpr(stmt.init, scope);
          return '';

        case 'ExprStmt': {
          const expr = stmt.expr;
          if (expr?.type === 'CallExpr') {
            const fn = this.userFunctions.get(expr.callee ?? expr.name ?? '');
            if (fn) this.callUserFunction(fn, expr.args ?? [], scope, fileOrigin);
            else this.evalExpr(expr, scope);
          } else {
            this.evalExpr(expr, scope);
          }
          return '';
        }

        case 'ComponentCall': {
          // Primero intentar función de usuario, luego componente UI
          const userFn = this.userFunctions.get(stmt.name);
          if (userFn) return this.callUserFunction(userFn, stmt.args ?? [], scope, fileOrigin);
          return this.renderComponentCall(stmt.name, stmt.args ?? [], scope, fileOrigin);
        }

        case 'IfStatement': {
          const cond = this.evalExpr(stmt.condition, scope);
          return cond
            ? this.execStmts(stmt.thenBody ?? [], this.childScope(scope), fileOrigin)
            : this.execElseChain(stmt.elseChain, scope, fileOrigin);
        }

        case 'ForStatement':
          return this.execForStmt(stmt, scope, fileOrigin);

        case 'WhileStatement': {
          const parts: string[] = [];
          const ws = this.childScope(scope);
          let guard = 0;
          while (this.evalExpr(stmt.condition, ws) && guard++ < 10_000) {
            parts.push(this.execStmts(stmt.body ?? [], this.childScope(ws), fileOrigin));
          }
          const content = parts.join('');
          if (this.insideTableContext) return content;
          return content ? `<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start;">${content}</div>` : '';
        }

        case 'SwitchStatement':
          return this.execSwitchStmt(stmt, scope, fileOrigin);

        case 'Block':
          return this.execStmts(stmt.body ?? [], this.childScope(scope), fileOrigin);

        case 'Return':
        case 'Break':
        case 'Continue':
        case 'Load':
  this.refreshRequested.next();
  return '';

        case 'Execute': {
          // execute `query` como statement (efecto lateral — ya pre-fetched)
          // No produce HTML, pero permite escrituras (INSERT/UPDATE/DELETE)
          this.evalExpr(stmt, scope);
          return '';
        }

        default:
          return '';
      }
    }

    private execElseChain(chain: any, scope: Scope, fileOrigin: string): string {
      if (!chain) return '';
      if (chain.type === 'ElseIf') {
        return this.evalExpr(chain.condition, scope)
          ? this.execStmts(chain.body ?? [], this.childScope(scope), fileOrigin)
          : this.execElseChain(chain.next, scope, fileOrigin);
      }
      if (chain.type === 'Else') {
        return this.execStmts(chain.body ?? [], this.childScope(scope), fileOrigin);
      }
      return '';
    }

    private execForStmt(stmt: any, scope: Scope, fileOrigin: string): string {
  const forScope = this.childScope(scope);

  // Inicialización
  if (stmt.init) {
    if (stmt.init.type === 'VariableDeclaration') {
      forScope.vars[stmt.init.name] = this.evalExpr(stmt.init.init, forScope);
    } else if (stmt.init.type === 'Assign') {
      this.setVar(stmt.init.name, this.evalExpr(stmt.init.value, forScope), forScope);
    }
  }

  const parts: string[] = [];
  let guard = 0;
  let shouldBreak = false;

  while (this.evalExpr(stmt.test, forScope) && guard++ < 10000 && !shouldBreak) {
    // Crear scope para esta iteración
    const iterScope = this.childScope(forScope);
    
    // Ejecutar cada statement del cuerpo, capturando si hay break/continue
    for (const bodyStmt of (stmt.body ?? [])) {
      const result = this.execStmtWithFlowControl(bodyStmt, iterScope, fileOrigin);
      
      if (result.break) {
        shouldBreak = true;
        break;
      }
      if (result.continue) {
        break;  // Salta el resto de statements de esta iteración
      }
      parts.push(result.html);
    }

    // Si hubo break, salir del while
    if (shouldBreak) break;

    // Actualización (solo si no hubo continue? No, el update siempre ocurre después de cada iteración
    // según el spec de for loop clásico)
    if (stmt.update) {
      if (stmt.update.type === 'PostfixExpr') {
        const name = stmt.update.operand;
        const val = Number(this.lookupVar(name, forScope) ?? 0);
        this.setVar(
          name,
          stmt.update.op === '++' ? val + 1 : val - 1,
          forScope
        );
      } else if (stmt.update.type === 'Assign') {
        this.setVar(
          stmt.update.name,
          this.evalExpr(stmt.update.value, forScope),
          forScope
        );
      }
    }
  }

  if (guard >= 10000) {
    console.warn('For detenido por protección (posible loop infinito)');
  }

  const content = parts.join('');
  if (this.insideTableContext) return content;
  
  return content
    ? `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">${content}</div>`
    : '';
}


/**
 * Ejecuta un statement individual y retorna información de flujo (break/continue)
 */
private execStmtWithFlowControl(stmt: any, scope: Scope, fileOrigin: string): { html: string; break: boolean; continue: boolean } {
  if (!stmt) return { html: '', break: false, continue: false };
  
  // Manejar Break
  if (stmt.type === 'Break') {
    return { html: '', break: true, continue: false };
  }
  
  // Manejar Continue
  if (stmt.type === 'Continue') {
    return { html: '', break: false, continue: true };
  }
  
  // Para bloques, ejecutar cada statement hijo
  if (stmt.type === 'Block') {
    let html = '';
    for (const child of (stmt.body ?? [])) {
      const result = this.execStmtWithFlowControl(child, scope, fileOrigin);
      if (result.break) return { html, break: true, continue: false };
      if (result.continue) return { html, break: false, continue: true };
      html += result.html;
    }
    return { html, break: false, continue: false };
  }
  
  // Para condicionales (if/else)
  if (stmt.type === 'IfStatement') {
    const cond = this.evalExpr(stmt.condition, scope);
    const body = cond ? (stmt.thenBody ?? []) : this.collectElseChainBody(stmt.elseChain, scope);
    let html = '';
    for (const child of body) {
      const result = this.execStmtWithFlowControl(child, scope, fileOrigin);
      if (result.break) return { html, break: true, continue: false };
      if (result.continue) return { html, break: false, continue: true };
      html += result.html;
    }
    return { html, break: false, continue: false };
  }
  
  // Para cualquier otro tipo, ejecutar normalmente
  return { 
    html: this.execStmt(stmt, scope, fileOrigin), 
    break: false, 
    continue: false 
  };
}

    private execSwitchStmt(stmt: any, scope: Scope, fileOrigin: string): string {
      const val = this.evalExpr(stmt.expr, scope);
      for (const c of (stmt.cases ?? []) as any[]) {
        const caseVal = this.stripQuotes(String(c.value ?? ''));
        // eslint-disable-next-line eqeqeq
        if (String(val) == caseVal || val == c.value) {
          return this.execStmts(c.body ?? [], this.childScope(scope), fileOrigin);
        }
      }
      if (stmt.default) {
        return this.execStmts(stmt.default.body ?? [], this.childScope(scope), fileOrigin);
      }
      return '';
    }

    private callUserFunction(fnNode: any, argExprs: any[], callerScope: Scope, fileOrigin: string): string {
      const params: { name: string; paramType: string }[] = fnNode.params ?? [];
      const argValues = argExprs.map((a: any) => this.evalExpr(a, callerScope));

      const fnScope: Scope = { vars: {}, parent: callerScope };
      params.forEach((p, i) => {
        const key = p.name.replace(/^\$/, '');
        fnScope.vars[key]       = argValues[i] ?? null;
        fnScope.vars['$' + key] = argValues[i] ?? null;
      });

      return this.execStmts(fnNode.body ?? [], fnScope, fileOrigin);
    }

    private renderComponentCall(
      name: string, argExprs: any[], callerScope: Scope, fileOrigin: string,
    ): string {
      const sym = this.st.lookup(name);
      if (!sym || sym.kind !== 'component') {
        this.er.add({ lexema: name, linea: 0, columna: 0,
          tipo: 'Semántico', descripcion: `Componente "@${name}" no está definido.`,
          fileId: fileOrigin });
        return `<!-- @${name} no encontrado -->`;
      }

      const compNode = sym.value as any;
      const params: { paramType: string; name: string }[] = compNode.params ?? [];
      const argValues = argExprs.map(a => this.evalExpr(a, callerScope));

      const compScope: Scope = { vars: {}, parent: callerScope };
      params.forEach((p, i) => {
        const key = p.name.replace(/^\$/, '');
        compScope.vars[key]       = argValues[i] ?? null;
        compScope.vars['$' + key] = argValues[i] ?? null;
      });

      return this.renderElementList(compNode.body ?? [], compScope, fileOrigin);
    }

    private renderElementList(elements: any[], scope: Scope, fileOrigin: string): string {
      return (elements ?? []).map(e => this.renderElement(e, scope, fileOrigin)).join('');
    }

    private renderElement(node: any, scope: Scope, fileOrigin: string): string {
      if (!node || node.type === 'ErrorNode') return '';
      switch (node.type) {
        case 'Section':   return this.renderSection(node, scope, fileOrigin);
        case 'Text':      return this.renderText(node, scope);
        case 'Img':       return this.renderImg(node, scope);
        case 'Form':      return this.renderForm(node, scope, fileOrigin);
        case 'Table':     return this.renderTable(node, scope, fileOrigin);
        case 'If':        return this.renderIf(node, scope, fileOrigin);
        case 'ForEach':   return this.renderForEach(node, scope, fileOrigin);
        case 'ForTrack':  return this.renderForTrack(node, scope, fileOrigin);
        case 'While':     return this.renderWhile(node, scope, fileOrigin);
        case 'DoWhile':   return this.renderDoWhile(node, scope, fileOrigin);
        case 'Switch':    return this.renderSwitch(node, scope, fileOrigin);
        case 'TableRow': {
          // [FIX] TableRow fuera de tabla — distinguir si es fila o celda
          // por su contenido. Si todos sus hijos son TableRow → es fila.
          const allRows = (node.cells ?? []).every((c: any) => c?.type === 'TableRow');
          if (allRows) {
            const cells = (node.cells ?? []).map((cell: any) =>
              `<td>${this.renderTableRowAsCellContent(cell, scope, fileOrigin)}</td>`
            ).join('');
            return `<tr>${cells}</tr>`;
          }
          // Sino, su contenido va directo (ya estamos dentro de un <tr>)
          return (node.cells ?? []).map((c: any) => this.renderElement(c, scope, fileOrigin)).join('');
        }
        case 'TableCell': return this.renderTableCell(node, scope, fileOrigin);
        default:          return '';
      }
    }

    private renderSection(node: any, scope: Scope, fileOrigin: string): string {
      const cls = this.classAttr(node.styles);
      const inner = this.renderElementList(node.body ?? [], scope, fileOrigin);
      // Detectar si la sección tiene alguna clase de tarjeta y añadir estilo inline
      let styleAttr = '';
      const cardClasses = ['card-base', 'card-primary', 'card-danger'];
      if (node.styles?.some((s: string) => cardClasses.includes(s))) {
        styleAttr = ' style="height: auto; min-height: 180px;"';
      }
      return `<div${cls}${styleAttr}>${inner}</div>`;
    }

    private renderText(node: any, scope: Scope): string {
      const cls  = this.classAttr(node.styles);
      const text = (node.content ?? [])
        .map((c: any) => this.evalTextItem(c, scope))
        .join('');

      // [FIX-EXPR-BACKTICKS] Evaluar `expr` (comillas invertidas) además de $vars.
      // Spec page 9: "operaciones dentro de un texto, por ejemplo: `$total + $subtotal + 0.5`"
      const evaluated = this.evalBackticks(text, scope);
      return `<div${cls}>${this.esc(evaluated)}</div>`;
    }

    /** Evalúa expresiones entre `comillas invertidas` dentro de un texto. */
    private evalBackticks(text: string, scope: Scope): string {
      return text.replace(/`([^`]+)`/g, (_, exprStr) => {
        try {
          // Reemplaza $vars en la expresión por sus valores numéricos antes de eval
          const replaced = exprStr.replace(/\$([a-zA-Z_]\w*)/g, (m: string, n: string) => {
            const v = this.lookupVar(n, scope);
            if (v === undefined || v === null) return '0';
            if (typeof v === 'number') return String(v);
            if (typeof v === 'boolean') return v ? '1' : '0';
            const s = String(v).replace(/"/g, '\\"');
            return `"${s}"`;
          });
          // eslint-disable-next-line no-new-func
          const result = Function(`"use strict"; return (${replaced});`)();
          return String(result);
        } catch {
          return '`' + exprStr + '`';
        }
      });
    }

    private renderImg(node: any, scope: Scope): string {
      const baseClasses = (node.styles ?? []).join(' ');
      const srcs: string[] = (node.sources ?? []).map((s: any) => {
        if (s.type === 'StringSrc') return this.interpolate(this.stripQuotes(s.value), scope);
        if (s.type === 'VarSrc') return String(this.lookupVar(s.value.replace(/^\$/, ''), scope) ?? '');
        if (s.type === 'VarIndexSrc') {
          const arr = this.lookupVar(s.name.replace(/^\$/, ''), scope) as unknown[];
          const idx = Number(this.evalExpr(s.index, scope));
          return String(Array.isArray(arr) ? (arr[idx] ?? '') : '');
        }
        return '';
      }).filter(Boolean);

      if (srcs.length === 0) return `<div class="${baseClasses}"></div>`;

      if (srcs.length === 1) {
        return `<div class="${baseClasses}">
          <img src="${this.esc(srcs[0])}" style="width:100%; height:100%; object-fit:cover; display:block;" />
        </div>`;
      }

      const cid = `carousel-${this.carouselCounter++}`;
      const rootClass = `${baseClasses ? baseClasses + ' ' : ''}${cid}`;

      const radios = srcs.map((_, i) => `
        <input type="radio" name="${cid}" id="${cid}-s${i}" ${i === 0 ? 'checked' : ''} />
      `).join('');

      const slides = srcs.map((url, i) => {
        const prev = (i - 1 + srcs.length) % srcs.length;
        const next = (i + 1) % srcs.length;
        return `
          <div class="slide">
            <img src="${this.esc(url)}" alt="slide ${i + 1}" />
            <label class="nav prev" for="${cid}-s${prev}">‹</label>
            <label class="nav next" for="${cid}-s${next}">›</label>
          </div>
        `;
      }).join('');

      const dots = srcs.map((_, i) => `
        <label class="dot" for="${cid}-s${i}"></label>
      `).join('');

      const styles = srcs.map((_, i) => `
        .${cid} input:nth-of-type(${i + 1}):checked ~ .slides .slide:nth-child(${i + 1}) {
          opacity: 1;
          z-index: 1;
          pointer-events: auto;
        }
        .${cid} input:nth-of-type(${i + 1}):checked ~ .dots label:nth-child(${i + 1}) {
          width: 24px;
          background: #fff;
          opacity: 1;
        }
      `).join('');

      return `
        <div class="${rootClass}" style="position:relative; overflow:hidden; width:100%; height:100%; min-height:260px; background:#666;">
          <style>
            .${cid} {
              position: relative;
              width: 100%;
              height: 100%;
              min-height: 260px;
              background: #666;
            }
            .${cid} input { display: none; }
            .${cid} .slides {
              position: relative;
              width: 100%;
              height: 100%;
              min-height: 260px;
            }
            .${cid} .slide {
              position: absolute;
              inset: 0;
              opacity: 0;
              transition: opacity .35s ease;
              pointer-events: none;
            }
            .${cid} .slide img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
            }
            .${cid} .nav {
              position: absolute;
              top: 50%;
              transform: translateY(-50%);
              width: 34px;
              height: 34px;
              border-radius: 999px;
              background: rgba(0,0,0,.35);
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              user-select: none;
              font-size: 28px;
              line-height: 1;
              z-index: 3;
            }
            .${cid} .prev { left: 12px; }
            .${cid} .next { right: 12px; }
            .${cid} .dots {
              position: absolute;
              left: 0;
              right: 0;
              bottom: 12px;
              display: flex;
              justify-content: center;
              gap: 6px;
              z-index: 4;
            }
            .${cid} .dot {
              width: 12px;
              height: 4px;
              border-radius: 999px;
              background: rgba(255,255,255,.45);
              cursor: pointer;
              transition: all .2s ease;
            }
            ${styles}
          </style>

          ${radios}
          <div class="slides">
            ${slides}
          </div>
          <div class="dots">
            ${dots}
          </div>
        </div>
      `;
    }

    private renderForm(node: any, scope: Scope, fileOrigin: string): string {
      const cls    = this.classAttr(node.styles);
      const inner  = this.renderFormItems(node.body ?? [], scope, fileOrigin);
      const submit = node.submit ? this.renderSubmit(node.submit, scope, fileOrigin) : '';
      return `<form${cls}>${inner}${submit}</form>`;
    }

    private renderFormItems(items: any[], scope: Scope, fileOrigin: string): string {
      return items.map(item => {
        switch (item.type) {
          case 'InputText':   return this.renderInput(item, 'text',     scope);
          case 'InputNumber': return this.renderInput(item, 'number',   scope);
          case 'InputBool':   return this.renderInput(item, 'checkbox', scope);
          default:            return this.renderElement(item, scope, fileOrigin);
        }
      }).join('');
    }

    private renderInput(node: any, inputType: string, scope: Scope): string {
      const cls = this.classAttr(node.styles);
      // [FIX-INPUT-LABEL] El "label" es texto visible, no atributo HTML.
      const props = (node.props ?? []) as any[];
      const idProp     = props.find(p => p.key === 'id');
      const labelProp  = props.find(p => p.key === 'label');
      const valueProp  = props.find(p => p.key === 'value');
      const id    = idProp    ? this.evalPropValue(idProp.value, scope)    : '';
      const label = labelProp ? this.evalPropValue(labelProp.value, scope) : '';
      const value = valueProp ? this.evalPropValue(valueProp.value, scope) : '';

      const idAttr = id ? ` id="${this.esc(String(id))}" name="${this.esc(String(id))}"` : '';
      const valAttr = inputType === 'checkbox'
        ? (value === true || value === 'true' || value === 'True' ? ' checked' : '')
        : ` value="${this.esc(String(value))}"`;

      const inputHtml = `<input type="${inputType}"${cls}${idAttr}${valAttr} />`;
      if (label) {
        return `<div style="margin:8px 0;">
          <label for="${this.esc(String(id))}" style="display:block; margin-bottom:4px;">${this.esc(String(label))}</label>
          ${inputHtml}
        </div>`;
      }
      return inputHtml;
    }

    private renderSubmit(node: any, scope: Scope, _fileOrigin: string): string {
  const cls = this.classAttr(node.styles ?? []);

  // Obtener label
  let label = 'Enviar';
  const bodyProps = node.body ?? [];
  const labelProp = bodyProps.find((p: any) => p?.key === 'label');
  if (labelProp) label = this.stripQuotes(String(labelProp.value ?? 'Enviar'));

  // Obtener función y sus argumentos @ref
  const fnProp = bodyProps.find((p: any) => p?.key === 'function');
  const fnCall = fnProp?.value;  // { type: 'FnCall', name: '$fnCrear', args: [...] }
  
  const fnName = fnCall?.name?.replace(/^\$/, '') ?? '';
  const atRefs: string[] = (fnCall?.args ?? [])
    .filter((a: any) => a.type === 'AtRef')
    .map((a: any) => a.value.replace(/^@/, ''));

  // Obtener el execute de la función para saber qué operación hacer
  const fnNode = this.userFunctions.get(fnName);
  let sqlAstTemplate: any = null;
  
  if (fnNode) {
    for (const stmt of (fnNode.body ?? [])) {
      if (stmt?.type === 'Execute') {
        // Parsear la query para obtener tipo de operación
        const clean = (stmt.query ?? '').replace(/^`|`$/g, '');
        try {
          const parsed = (SqlParser as any).parse(clean);
          sqlAstTemplate = Array.isArray(parsed?.ast) ? parsed.ast[0] : parsed?.ast;
        } catch(e) { console.warn('Submit parse error:', e); }
        break;
      }
    }
  }

  if (!sqlAstTemplate) {
    return `<button type="submit"${cls}>${this.esc(label)}</button>`;
  }

  const op       = sqlAstTemplate.type;          // INSERT | UPDATE | DELETE
  const table    = sqlAstTemplate.table;
  const updateId = sqlAstTemplate.id ?? null;    // Para UPDATE con id fijo

  // [FIX] Construir valores dinámicamente
  const collectValues = atRefs.map(ref => {
    const refEsc = ref.replace(/'/g, "\\'");
    return `{ col: '${refEsc}', value: getVal('${refEsc}', form) }`;
  }).join(', ');

  const onSubmit = `(async function(e) {
    e.preventDefault();
    const form = e.target.closest('form');
    
    function getVal(id, f) {
      const el = f.querySelector('[id="' + id + '"]');
      if (!el) return null;
      if (el.type === 'checkbox') return el.checked ? 1 : 0;
      const n = Number(el.value);
      return isNaN(n) || el.type === 'text' ? el.value : n;
    }

    const ast = {
      type: '${op}',
      table: '${table}',
      ${op === 'DELETE'
        ? `id: parseInt(getVal('${atRefs[0]}', form) || 0)`
        : `values: [${collectValues}]`
      }
      ${op === 'UPDATE' && updateId ? `, id: ${updateId}` : ''}
      ${op === 'UPDATE' && !updateId
        ? `, id: parseInt(getVal('${atRefs.find(r => r === 'id') ?? 'id'}', form) || 0)`
        : ''
      }
    };
    
    try {
      const res = await fetch('http://localhost:3000/api/sql/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ast, project: window.yferaProject })
      });
      const result = await res.json();
      console.log('[YFERA Submit] result:', result);
      
      if (result.success) {
        window.parent?.postMessage({ type: 'YFERA_REFRESH' }, '*');
      } else {
        alert('Error: ' + (result.error || 'Error desconocido'));
      }
    } catch(err) {
      console.error('[YFERA Submit] fetch error:', err);
      alert('No se pudo conectar con el servidor');
    }
  })(event)`;

  return `<button type="button"${cls} onclick="${this.esc(onSubmit)}">${this.esc(label)}</button>`;
}

    private renderTable(node: any, scope: Scope, fileOrigin: string): string {
      const cls = this.classAttr(node.styles);
      this.insideTableContext = true;
      const rows = this.flattenTableRows(node.rows ?? [], scope, fileOrigin);
      this.insideTableContext = false;
      // Añadir margin-bottom: 20px al div envolvente
      return `<div style="width: 100%; overflow-x: auto; margin-bottom: 20px;">
        <table${cls} style="border-collapse: collapse; width: 100%;">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
    }

    /** Aplana ForEach/If/Switch/While en filas reales <tr><td>...</td></tr>. */
    private flattenTableRows(items: any[], scope: Scope, fileOrigin: string): string {
      const out: string[] = [];
      for (const item of (items ?? [])) {
        if (!item) continue;

        if (item.type === 'TableRow') {
          out.push(this.renderTableRow(item, scope, fileOrigin));

        } else if (item.type === 'ForEach') {
          const arrKey = (item.array ?? '').replace(/^\$/, '');
          const arr = this.lookupVar(arrKey, scope);

          if (!Array.isArray(arr) || arr.length === 0) {
            if (item.empty) {
              out.push(this.flattenTableRows(item.empty.body ?? [], scope, fileOrigin));
            }
            continue;
          }

          for (const v of arr) {
            const cs = this.childScope(scope);
            const k = (item.item ?? '$item').replace(/^\$/, '');
            cs.vars[k] = v;
            cs.vars['$' + k] = v;
            out.push(this.flattenTableRows(item.body ?? [], cs, fileOrigin));
          }

        } else if (item.type === 'ForTrack') {
          const bindings: any[] = item.bindings ?? [];
          const arrays = bindings.map((b: any) => {
            const a = this.lookupVar(b.array.replace(/^\$/, ''), scope);
            return Array.isArray(a) ? a : [];
          });
          const len = arrays.length
            ? arrays.reduce((m, a) => Math.min(m, a.length), Infinity)
            : 0;
          for (let i = 0; i < len; i++) {
            const cs = this.childScope(scope);
            bindings.forEach((b, bi) => {
              const k = b.item.replace(/^\$/, '');
              cs.vars[k] = arrays[bi][i];
              cs.vars['$' + k] = arrays[bi][i];
            });
            const trackKey = (item.trackVar ?? '$i').replace(/^\$/, '');
            cs.vars[trackKey] = i;
            cs.vars['$' + trackKey] = i;

            out.push(this.flattenTableRows(item.body ?? [], cs, fileOrigin));
          }

        } else if (item.type === 'If') {
          const body = this.evalExpr(item.condition, scope)
            ? (item.thenBody ?? [])
            : this.collectElseChainBody(item.elseChain, scope);
          out.push(this.flattenTableRows(body, scope, fileOrigin));

        } else if (item.type === 'Switch') {
          const val = this.evalExpr(item.expr, scope);
          let matched = false;
          for (const c of (item.cases ?? [])) {
            const caseVal = this.stripQuotes(String(c.value ?? ''));
            // eslint-disable-next-line eqeqeq
            if (String(val) == caseVal || val == c.value) {
              out.push(this.flattenTableRows(c.body ?? [], scope, fileOrigin));
              matched = true;
              break;
            }
          }
          if (!matched && item.defaultCase) {
            out.push(this.flattenTableRows(item.defaultCase.body ?? [], scope, fileOrigin));
          }

        } else if (item.type === 'While') {
          let guard = 0;
          const ws = this.childScope(scope);
          while (this.evalExpr(item.condition, ws) && guard++ < 10_000) {
            out.push(this.flattenTableRows(item.body ?? [], this.childScope(ws), fileOrigin));
          }

        } else {
          // [FIX-TABLAS] Texto/img/sección al nivel de tabla → fila con una celda
          const inner = this.renderElement(item, scope, fileOrigin);
          if (inner) out.push(`<tr><td style="border: 1px solid #ccc; padding: 8px;">${inner}</td></tr>`);
        }
      }
      return out.join('');
    }

    /** Renderiza un TableRow como <tr> con sus hijos como <td>. */
    private renderTableRow(row: any, scope: Scope, fileOrigin: string): string {
      const cells: string[] = [];
      for (const child of (row.cells ?? [])) {
        if (!child) continue;
        if (child.type === 'TableRow') {
          // Hijo es otro [[ ]] → es una celda
          cells.push(`<td style="border: 1px solid #ccc; padding: 8px;">${this.renderTableRowAsCellContent(child, scope, fileOrigin)}</td>`);
        } else if (child.type === 'ForEach' || child.type === 'ForTrack' ||
                  child.type === 'If' || child.type === 'Switch' || child.type === 'While') {
          const inner = this.renderElement(child, scope, fileOrigin);
          if (inner) cells.push(`<td style="border: 1px solid #ccc; padding: 8px;">${inner}</td>`);
        } else {
          cells.push(`<td style="border: 1px solid #ccc; padding: 8px;">${this.renderElement(child, scope, fileOrigin)}</td>`);
        }
      }
      return `<tr>${cells.join('')}</tr>`;
    }

    /** Cuando un TableRow funciona como celda, renderiza su contenido directo. */
    private renderTableRowAsCellContent(row: any, scope: Scope, fileOrigin: string): string {
      return (row.cells ?? [])
        .map((c: any) => {
          if (c?.type === 'TableRow') {
            return this.renderTableRowAsCellContent(c, scope, fileOrigin);
          }
          return this.renderElement(c, scope, fileOrigin);
        })
        .join('');
    }

    /**
 * Recolecta el cuerpo de un else/else if chain
 */
private collectElseChainBody(chain: any, scope: Scope): any[] {
  if (!chain) return [];
  if (chain.type === 'ElseIf') {
    if (this.evalExpr(chain.condition, scope)) {
      return chain.body ?? [];
    }
    return this.collectElseChainBody(chain.next, scope);
  }
  if (chain.type === 'Else') {
    return chain.body ?? [];
  }
  return [];
}

    private renderTableCell(cell: any, scope: Scope, fileOrigin: string): string {
      if (cell?.type === 'TableCell') {
        return `<td>${this.renderElementList(cell.body ?? [], scope, fileOrigin)}</td>`;
      }
      return this.renderElement(cell, scope, fileOrigin);
    }

    private renderIf(node: any, scope: Scope, fileOrigin: string): string {
      if (this.evalExpr(node.condition, scope)) {
        return this.renderElementList(node.thenBody ?? [], scope, fileOrigin);
      }
      return this.renderElseChain(node.elseChain, scope, fileOrigin);
    }

    private renderElseChain(chain: any, scope: Scope, fileOrigin: string): string {
      if (!chain) return '';
      if (chain.type === 'ElseIf') {
        return this.evalExpr(chain.condition, scope)
          ? this.renderElementList(chain.body ?? [], scope, fileOrigin)
          : this.renderElseChain(chain.next, scope, fileOrigin);
      }
      if (chain.type === 'Else') return this.renderElementList(chain.body ?? [], scope, fileOrigin);
      return '';
    }

    private renderForEach(node: any, scope: Scope, fileOrigin: string): string {
      const arrKey = (node.array ?? '').replace(/^\$/, '');
      const arr = this.lookupVar(arrKey, scope);

      if (!Array.isArray(arr) || arr.length === 0) {
        return node.empty
          ? this.renderElementList(node.empty.body ?? [], scope, fileOrigin)
          : '';
      }

      const parts: string[] = [];
      for (const item of arr) {
        const cs = this.childScope(scope);
        const itemKey = (node.item ?? '$item').replace(/^\$/, '');
        cs.vars[itemKey] = item;
        cs.vars['$' + itemKey] = item;
        parts.push(this.renderElementList(node.body ?? [], cs, fileOrigin));
      }

      const inner = parts.join('');
      if (this.insideTableContext) return inner;
      // [FIX] ForEach: sin flex-basis, solo flex horizontal
      return inner ? `<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start;">${inner}</div>` : '';
    }

    private renderForTrack(node: any, scope: Scope, fileOrigin: string): string {
      const bindings: { item: string; array: string }[] = node.bindings ?? [];

      const arrays = bindings.map(b => {
        const arr = this.lookupVar(b.array.replace(/^\$/, ''), scope);
        return Array.isArray(arr) ? arr : [];
      });

      const len = arrays.length
        ? arrays.reduce((m, a) => Math.min(m, a.length), Infinity)
        : 0;

      if (!isFinite(len) || len <= 0) {
        return node.emptyBody
          ? this.renderElementList(node.emptyBody ?? [], scope, fileOrigin)
          : '';
      }

      const parts: string[] = [];

      for (let i = 0; i < len; i++) {
        const cs = this.childScope(scope);

        bindings.forEach((b, bi) => {
          const k = b.item.replace(/^\$/, '');
          cs.vars[k] = arrays[bi][i];
          cs.vars['$' + k] = arrays[bi][i];
        });

        const trackKey = (node.trackVar ?? '$i').replace(/^\$/, '');
        cs.vars[trackKey] = i;
        cs.vars['$' + trackKey] = i;

        parts.push(this.renderElementList(node.body ?? [], cs, fileOrigin));
      }

      return `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">${parts.join('')}</div>`;
    }

    private renderWhile(node: any, scope: Scope, fileOrigin: string): string {
      const parts: string[] = [];
      const ws = this.childScope(scope);
      let guard = 0;
      while (this.evalExpr(node.condition, ws) && guard++ < 10_000) {
        parts.push(this.renderElementList(node.body ?? [], this.childScope(ws), fileOrigin));
      }
      const content = parts.join('');
      if (this.insideTableContext) return content;
      // [FIX] While: sin flex-basis
      return content
        ? `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">${content}</div>`
        : '';
    }

    private renderDoWhile(node: any, scope: Scope, fileOrigin: string): string {
      const parts: string[] = [];
      const ds = this.childScope(scope);
      let guard = 0;
      do {
        parts.push(this.renderElementList(node.body ?? [], this.childScope(ds), fileOrigin));
      } while (this.evalExpr(node.condition, ds) && guard++ < 10_000);
      const content = parts.join('');
      if (this.insideTableContext) return content;
      return content;
    }

    private renderSwitch(node: any, scope: Scope, fileOrigin: string): string {
      const val = this.evalExpr(node.expr, scope);
      for (const c of (node.cases ?? []) as any[]) {
        const caseVal = this.stripQuotes(String(c.value ?? ''));
        // eslint-disable-next-line eqeqeq
        if (String(val) == caseVal || val == c.value) {
          return this.renderElementList(c.body ?? [], scope, fileOrigin);
        }
      }
      if (node.defaultCase) return this.renderElementList(node.defaultCase.body ?? [], scope, fileOrigin);
      return '';
    }

    private evalExpr(expr: any, scope: Scope): unknown {
      if (expr === null || expr === undefined) return null;
      switch (expr.type) {
        case 'NumLit':
          return Number(expr.value);
        case 'StringLit':
          return this.stripQuotes(String(expr.value));
        case 'BoolLit':
          return expr.value === 'true' || expr.value === 'True';
        case 'NullLit':
          return null;

        case 'Identifier':
        case 'Var': {
          const raw = String(expr.value);
          const key = raw.replace(/^\$/, '');
          return this.lookupVar(key, scope) ?? this.lookupVar(raw, scope);
        }

        case 'VarIndex': {
          const arr = this.evalExpr({ type: 'Var', value: expr.name }, scope) as unknown[];
          return Array.isArray(arr) ? arr[Number(this.evalExpr(expr.index, scope))] : undefined;
        }
        case 'IndexAccess': {
          const obj = this.evalExpr(expr.object, scope) as unknown[];
          return Array.isArray(obj) ? obj[Number(this.evalExpr(expr.index, scope))] : undefined;
        }
        case 'MemberAccess': {
          const obj = this.evalExpr(expr.object, scope) as Record<string, unknown>;
          return obj?.[expr.property];
        }

        case 'BinOp':
          return this.evalBinOp(expr.op, expr.left, expr.right, scope);

        case 'UnaryOp':
          if (expr.op === '-') return -Number(this.evalExpr(expr.operand, scope));
          if (expr.op === '!') return !this.evalExpr(expr.operand, scope);
          return null;

        case 'PostfixExpr': {
          const raw2 = typeof expr.operand === 'string' ? expr.operand : (expr.operand?.value ?? '');
          const k2   = raw2.replace(/^\$/, '');
          const cur  = Number(this.lookupVar(k2, scope) ?? 0);
          this.setVar(k2, expr.op === '++' ? cur + 1 : cur - 1, scope);
          return cur;
        }

        case 'Assign': {
          const val = this.evalExpr(expr.value, scope);
          this.setVar(expr.name, val, scope);
          return val;
        }
        case 'CompoundAssign': {
          const cur = Number(this.lookupVar(expr.name, scope) ?? 0);
          const rhs = Number(this.evalExpr(expr.value, scope));
          const next = expr.op === '+=' ? cur + rhs : cur - rhs;
          this.setVar(expr.name, next, scope);
          return next;
        }

        case 'ArrayLiteral':
          return (expr.elements ?? []).map((e: any) => this.evalExpr(e, scope));
        case 'ArraySize':
          return new Array(Number(expr.size)).fill(null);

        case 'Execute': {
          // Leer resultado pre-fetched del caché
          const cached = this.executeCache.get(expr.query);
          if (!cached) return null;
          // Si el resultado es un array de filas, extraer la columna solicitada
          if (Array.isArray(cached)) {
            // Un SELECT tabla.columna devuelve [{columna: valor}, ...]
            return cached.map((row: any) => {
              const vals = Object.values(row);
              return vals.length === 1 ? vals[0] : row;
            });
          }
          return cached;
        }

        case 'CallExpr':
          return null;

        default:
          if (expr.op) return this.evalBinOp(expr.op, expr.left, expr.right, scope);
          return null;
      }
    }

    private evalBinOp(op: string, left: any, right: any, scope: Scope): unknown {
      const l = this.evalExpr(left,  scope);
      const r = this.evalExpr(right, scope);
      switch (op) {
        case '+':   return (typeof l === 'string' || typeof r === 'string')
                      ? String(l ?? '') + String(r ?? '') : Number(l) + Number(r);
        case '-':   return Number(l) - Number(r);
        case '*':   return Number(l) * Number(r);
        case '/':   return Number(r) !== 0 ? Number(l) / Number(r) : 0;
        case '%':   return Number(l) % Number(r);
        // eslint-disable-next-line eqeqeq
        case '==':  return l == r;
        // eslint-disable-next-line eqeqeq
        case '!=':  return l != r;
        case '===': return l === r;
        case '!==': return l !== r;
        case '>':   return Number(l) > Number(r);
        case '>=':  return Number(l) >= Number(r);
        case '<':   return Number(l) <  Number(r);
        case '<=':  return Number(l) <= Number(r);
        case '&&':  return l && r;
        case '||':  return l || r;
        default:    return null;
      }
    }

    private evalTextItem(item: any, scope: Scope): string {
      if (!item) return '';
      if (item.type === 'StringLit') return this.interpolate(this.stripQuotes(String(item.value)), scope);
      if (item.type === 'Var')       return String(this.lookupVar(item.value.replace(/^\$/, ''), scope) ?? item.value);
      if (item.type === 'Expr')      return String(this.evalExpr(item.value, scope) ?? '');
      return String(this.evalExpr(item, scope) ?? '');
    }

    private evalPropValue(value: any, scope: Scope): unknown {
      if (!value) return '';
      if (value.type === 'StringLit') return this.interpolate(this.stripQuotes(String(value.value)), scope);
      if (value.type === 'NumLit')    return Number(value.value);
      if (value.type === 'BoolLit')   return value.value === 'true' || value.value === 'True';
      if (value.type === 'Var')       return this.lookupVar(value.value.replace(/^\$/, ''), scope);
      return this.evalExpr(value, scope);
    }

    private childScope(parent: Scope): Scope {
      return { vars: {}, parent };
    }

    private lookupVar(name: string, scope: Scope): unknown {
      let s: Scope | null = scope;
      while (s) {
        if (name in s.vars) return s.vars[name];
        s = s.parent;
      }
      return undefined;
    }

    private setVar(name: string, value: unknown, scope: Scope): void {
      let s: Scope | null = scope;
      while (s) {
        if (name in s.vars) { s.vars[name] = value; return; }
        s = s.parent;
      }
      scope.vars[name] = value;
    }

    private classAttr(styles: string[]): string {
      return styles?.length ? ` class="${styles.join(' ')}"` : '';
    }

    private esc(text: string): string {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    private stripQuotes(s: string): string {
      return s.replace(/^["'`]|["'`]$/g, '');
    }

    private interpolate(s: string, scope: Scope): string {
      return s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
        const val = this.lookupVar(name, scope);
        return val !== undefined && val !== null ? String(val) : '$' + name;
      });
    }

    private normalizeQuery(q: string): string {
      return String(q ?? '').replace(/^`|`$/g, '').trim();
    }

    private async resolveExecuteValue(varName: string, query: string): Promise<unknown> {
      const clean = this.normalizeQuery(query);

      const keys = [varName, query, clean, `\`${clean}\``];
      for (const k of keys) {
        const cached = this.executeCache.get(k);
        if (cached !== undefined) return cached;
      }

      const result = await this.fetchExecute(clean);
      for (const k of keys) this.executeCache.set(k, result);
      return result;
    }

    
  }




