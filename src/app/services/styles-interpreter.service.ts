import { Injectable } from '@angular/core';
import { SymbolTableService } from './symbol-table.service';
import { ErrorReporterService } from './error-reporter.service';

export interface StylesParserResult {
  ast:           StyleNode[];
  lexicalErrors: JisonError[];
  syntaxErrors:  JisonError[];
}

export interface JisonError {
  lexema:      string;
  linea:       number;
  columna:     number;
  descripcion: string;
}

export interface StyleNode {
  type:        'StyleDeclaration' | 'ForLoop';
  name?:       string;
  extends?:    string | null;
  properties?: PropNode[];
  variable?:   string;
  from?:       number;
  to?:         number;
  inclusive?:  boolean;
  body?:       StyleNode[];
  loc?:        { line: number; col: number };
}

export interface PropNode {
  type:  'Property';
  key:   string;
  value: ValueNode;
  loc?:  { line: number; col: number };
}

export type ValueNode =
  | { type: 'Number';          value: number }
  | { type: 'Percent';         value: number }
  | { type: 'Color';           value: string }
  | { type: 'Ident';           value: string }
  | { type: 'Var';             name:  string }
  | { type: 'BinOp';           op: string; left: ValueNode; right: ValueNode }
  | { type: 'Unary';           op: string; expr: ValueNode }
  | { type: 'BorderShorthand'; width: ValueNode; style: string; color: ValueNode };


@Injectable({ providedIn: 'root' })
export class StylesInterpreterService {

  constructor(
    private st: SymbolTableService,
    private er: ErrorReporterService,
  ) {}

  interpret(result: StylesParserResult, fileOrigin: string): string {
    console.debug('[styles] INTERPRET CALLED');
    console.debug('[styles] result:', result);
    console.debug('[styles] AST:', result.ast);
    console.debug('[styles] AST length:', result.ast?.length);

    // 1. Trasladar errores de Jison al servicio de errores
    for (const e of result.lexicalErrors) {
      this.er.add({
        lexema: e.lexema, linea: e.linea, columna: e.columna,
        tipo: 'Léxico', descripcion: e.descripcion, fileId: fileOrigin,
      });
    }
    for (const e of result.syntaxErrors) {
      this.er.add({
        lexema: e.lexema, linea: e.linea, columna: e.columna,
        tipo: 'Sintáctico', descripcion: e.descripcion, fileId: fileOrigin,
      });
    }

    // Recorrer el AST y generar CSS
    const cssLines: string[] = [];
    const inheritMap = new Map<string, PropNode[]>();

    for (const node of result.ast) {
      console.debug('[styles] processing node:', node?.type, node?.name);
      if (!node) continue;
      if (node.type === 'StyleDeclaration') {
        console.debug('[styles] StyleDeclaration found:', node.name);
        cssLines.push(this.processDeclaration(node, inheritMap, fileOrigin));
      } else if (node.type === 'ForLoop') {
        console.debug('[styles] ForLoop found:', node.variable);
        cssLines.push(...this.processForLoop(node, inheritMap, fileOrigin));
      }
    }

    console.debug('[styles] final CSS lines:', cssLines.length);
    return cssLines.filter(Boolean).join('\n\n');
  }

  private mapPropKey(key: string): string {
    const map: Record<string, string> = {
      'background color': 'background-color',
      'text size': 'font-size',
      'text font': 'font-family',
      'text align': 'text-align',
      'border radius': 'border-radius',
      'border color': 'border-color',
      'border width': 'border-width',
      'border style': 'border-style',
      'min width': 'min-width',
      'max width': 'max-width',
      'min height': 'min-height',
      'max height': 'max-height',
      'margin left': 'margin-left',
      'margin right': 'margin-right',
      'margin top': 'margin-top',
      'margin bottom': 'margin-bottom',
      'padding left': 'padding-left',
      'padding right': 'padding-right',
      'padding top': 'padding-top',
      'padding bottom': 'padding-bottom',
      'border top style': 'border-top-style',
      'border right style': 'border-right-style',
      'border bottom style': 'border-bottom-style',
      'border left style': 'border-left-style',
      'border top': 'border-top',
      'border right': 'border-right',
      'border bottom': 'border-bottom',
      'border left': 'border-left',
    };
    // Si hay espacios, convertir a kebab-case genérico
    if (map[key]) return map[key];
    return key.replace(/ /g, '-').toLowerCase();
  }

  private processDeclaration(
    node: StyleNode,
    inheritMap: Map<string, PropNode[]>,
    fileOrigin: string,
    varEnv: Record<string, number> = {},
  ): string {
    console.debug('[styles] processDeclaration', node.name, node.properties, varEnv);
    const name  = node.name ?? 'unknown';
    const props = node.properties?.filter(Boolean) ?? [];

    console.debug('[styles] props after filter:', props); // <-- NUEVO
    console.debug('[styles] props length:', props.length); // <-- NUEVO

    let allProps: PropNode[] = [];
    if (node.extends) {
      const parentProps = inheritMap.get(node.extends) ?? [];
      if (parentProps.length === 0) {
        this.er.add({
          lexema: node.extends,
          linea:  node.loc?.line ?? 0,
          columna: node.loc?.col ?? 0,
          tipo:   'Semántico',
          descripcion: `El estilo "${node.extends}" no está definido antes de ser extendido.`,
          fileId: fileOrigin,
        });
      }
      allProps = [...parentProps];
    }

    const propMap = new Map<string, PropNode>();
    for (const p of allProps) propMap.set(p.key, p);
    for (const p of props)    propMap.set(p.key, p);
    const finalProps = [...propMap.values()];

    console.debug('[styles] finalProps:', finalProps); // <-- NUEVO
    console.debug('[styles] finalProps length:', finalProps.length); // <-- NUEVO

    inheritMap.set(name, finalProps);

    this.st.define({
      name, kind: 'style', fileOrigin, value: finalProps,
    });

    const declarations = [
      'box-sizing: border-box;',
      ...finalProps
        .map(p => this.propToCss(p, varEnv))
        .filter(Boolean)
        .map(line => `  ${line}`)
    ].join('\n');

    return `.${name} {\n${declarations}\n}`;
  }

  private processForLoop(
    node: StyleNode,
    inheritMap: Map<string, PropNode[]>,
    fileOrigin: string,
  ): string[] {
    console.debug('[styles] processing @for', node);
    const results: string[] = [];
    const varName = node.variable ?? '$i';
    const from    = node.from ?? 1;
    const to      = node.to   ?? 1;
    const body    = node.body ?? [];
    const limit   = node.inclusive ? to : to - 1;

    for (let i = from; i <= limit; i++) {
      // Exponer la variable con y sin '$' para coincidir con lo que el AST pueda usar
      const bare = String(varName).replace(/^\$/, '');
      const varEnv: Record<string, number> = { [varName]: i, [bare]: i, ['$' + bare]: i };

      for (const child of body) {
        if (!child || child.type !== 'StyleDeclaration') continue;
        console.debug('[styles] for-loop child decl:', child.name, child.properties);
        const resolvedName = this.resolveVarInName(child.name ?? '', varEnv);
        const resolvedNode: StyleNode = { ...child, name: resolvedName };
        results.push(this.processDeclaration(resolvedNode, inheritMap, fileOrigin, varEnv));
      }
    }

    return results;
  }

  private propToCss(prop: PropNode, varEnv: Record<string, number>): string {
    console.debug('[propToCss] key:', prop.key, 'value:', prop.value);
    const val = this.resolveValue(prop.value, varEnv);
    console.debug('[propToCss] resolved to:', val);
    if (val === null) return '';
    const cssKey = this.mapPropKey(prop.key);

    if (cssKey === 'height') {
      return `height: auto; min-height: ${val};`;
    }

    return `${cssKey}: ${val};`;
  }

  private resolveValue(node: ValueNode, varEnv: Record<string, number>): string | null {
    if (!node) {
      console.warn('[resolveValue] node is null/undefined');
      return null;
    }
    console.debug('[resolveValue] node type:', node.type, 'node:', node);
    switch (node.type) {
      case 'Number':  return `${node.value}px`;
      case 'Percent': return `${node.value}%`;
      case 'Color':   return node.value;
      case 'Ident':   return node.value.toLowerCase();
      case 'Var': {
        const keyBare = String(node.name).replace(/^\$/, '');
        const num = varEnv[node.name] ?? varEnv[keyBare] ?? varEnv['$' + keyBare];
        return num !== undefined ? `${num}px` : node.name;
      }
      case 'BinOp': {
        const l = this.evalExpr(node.left,  varEnv);
        const r = this.evalExpr(node.right, varEnv);
        if (l === null || r === null) return null;
        return `${this.applyOp(node.op, l, r)}px`;
      }
      case 'Unary': {
        const v = this.evalExpr(node.expr, varEnv);
        return v !== null ? `${-v}px` : null;
      }
      case 'BorderShorthand': {
        const w = this.evalExpr(node.width, varEnv);
        const c = this.resolveValue(node.color, varEnv);
        return `${w ?? 1}px ${node.style} ${c ?? 'currentColor'}`;
      }
      default: return null;
    }
  }

  private evalExpr(node: ValueNode, varEnv: Record<string, number>): number | null {
    if (!node) return null;
    switch (node.type) {
      case 'Number':  return node.value;
      case 'Percent': return node.value;
      case 'Var':     return varEnv[node.name] ?? varEnv[String(node.name).replace(/^\$/, '')] ?? null;
      case 'BinOp': {
        const l = this.evalExpr(node.left,  varEnv);
        const r = this.evalExpr(node.right, varEnv);
        if (l === null || r === null) return null;
        return this.applyOp(node.op, l, r);
      }
      case 'Unary': {
        const v = this.evalExpr(node.expr, varEnv);
        return v !== null ? -v : null;
      }
      default: return null;
    }
  }

  private applyOp(op: string, l: number, r: number): number {
    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return r !== 0 ? l / r : 0;
      case '%': return l % r;
      default:  return l;
    }
  }

  private resolveVarInName(name: string, varEnv: Record<string, number>): string {
    let resolved = name;
    for (const [varName, value] of Object.entries(varEnv)) {
      resolved = resolved.replace(varName, String(value));
    }
    return resolved;
  }
}