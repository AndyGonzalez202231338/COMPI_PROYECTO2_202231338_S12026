import { Injectable, signal, computed } from '@angular/core';
import { FileNode, FileType } from '../models/file-node.model';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

@Injectable({ providedIn: 'root' })
export class FileSystemService {

  // Signal con el árbol completo
  private _tree = signal<FileNode[]>([]);
  // Signal con el archivo activo en el editor
  private _activeFileId = signal<string | null>(null);
  // Nombre del proyecto actual (usado para la base de datos SQLite)
  readonly projectName = signal<string>('mi-proyecto');

  // Computed públicos (readonly)
  readonly tree = this._tree.asReadonly();
  readonly activeFileId = this._activeFileId.asReadonly();

  readonly activeFile = computed(() => {
    const id = this._activeFileId();
    return id ? this.findById(id) : null;
  });

  // Tabs abiertos (archivos con isOpen === true)
  readonly openFiles = computed(() =>
    this.flatList().filter(f => f.isOpen && f.type !== 'folder')
  );

  // CRUD

  createFile(parentId: string | null, name: string, type: FileType): FileNode {
    const node: FileNode = {
      id: crypto.randomUUID(),
      name,
      type,
      path: this.buildPath(parentId, name, type),
      content: this.defaultContent(type),
      isOpen: false,
      isDirty: false,
      parentId,
      children: type === 'folder' ? [] : undefined,
    };
    this._tree.update(tree => this.insertNode(tree, parentId, node));
    return node;
  }

  createFolder(parentId: string | null, name: string): FileNode {
    return this.createFile(parentId, name, 'folder');
  }

  updateContent(fileId: string, content: string): void {
    this._tree.update(tree =>
      this.mapNode(tree, fileId, n => ({ ...n, content, isDirty: true }))
    );
  }

  openFile(fileId: string): void {
    this._tree.update(tree =>
      this.mapNode(tree, fileId, n => ({ ...n, isOpen: true }))
    );
    this._activeFileId.set(fileId);
  }

  closeFile(fileId: string): void {
    this._tree.update(tree =>
      this.mapNode(tree, fileId, n => ({ ...n, isOpen: false }))
    );
    // Activar otro tab si existiera
    const remaining = this.openFiles().filter(f => f.id !== fileId);
    this._activeFileId.set(remaining.at(-1)?.id ?? null);
  }

  setActive(fileId: string): void {
    this._activeFileId.set(fileId);
  }

  deleteNode(fileId: string): void {
    this._tree.update(tree => this.removeNode(tree, fileId));
  }

  setProjectName(name: string): void {
    this.projectName.set(name.trim() || 'mi-proyecto');
  }

  /** Asegura que existe un nodo .db en la raíz del árbol para el proyecto actual. */
  ensureDbNode(projectName: string): void {
    const safe = projectName.trim() || 'mi-proyecto';
    console.log('[fs] ensureDbNode called with projectName=', projectName, 'safe=', safe);
    // Log árbol actual (flat)
    try {
      const flatBefore = this.flatList().map(n => ({ id: n.id, name: n.name, type: n.type, path: n.path }));
      console.log('[fs] ensureDbNode - flat BEFORE:', flatBefore);
    } catch (e) {
      console.log('[fs] ensureDbNode - failed to list flat BEFORE:', e);
    }

    // Buscar en todo el árbol (flatList) para evitar duplicados en subcarpetas
    const existing = this.flatList().find(n => n.type === 'db');
    if (existing) {
      console.log('[fs] DB node already exists:', { id: existing.id, name: existing.name, path: existing.path });
      return;
    }

    const node: FileNode = {
      id: crypto.randomUUID(),
      name: safe,
      type: 'db',
      path: `./${safe}.db`,
      content: '',
      isOpen: false,
      isDirty: false,
      parentId: null,
    };

    this._tree.update(tree => {
      const newTree = [node, ...tree];
      // Log resumen del árbol tras creación
      try {
        const flat = this.flatList(newTree).map(n => ({ id: n.id, name: n.name, type: n.type, path: n.path }));
        console.log('[fs] DB node created, tree summary:', flat);
      } catch (err) {
        console.log('[fs] DB node created but failed to compute flatList:', err);
      }
      return newTree;
    });
    // Log árbol final
    try {
      const flatAfter = this.flatList().map(n => ({ id: n.id, name: n.name, type: n.type, path: n.path }));
      console.log('[fs] ensureDbNode - flat AFTER:', flatAfter);
    } catch (e) {
      console.log('[fs] ensureDbNode - failed to list flat AFTER:', e);
    }
    console.log('[fs] ensureDbNode finished creating node:', { id: node.id, name: node.name, path: node.path });
  }

  // Import/Export

  /** Carga un proyecto desde un objeto JSON (árbol exportado) */
  loadProject(exported: FileNode[]): void {
    this._tree.set(exported);
    this._activeFileId.set(null);
  }

  /** Exporta el árbol como JSON para descarga */
  exportProject(): string {
    return JSON.stringify(this._tree(), null, 2);
  }

  /** Retorna mapa ruta, contenido (para que los parsers resuelvan imports) */
  getPathMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const f of this.flatList()) {
      if (f.type !== 'folder') map.set(f.path, f.content);
    }
    return map;
  }

  findById(id: string, nodes = this._tree()): FileNode | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const found = this.findById(id, n.children);
        if (found) return found;
      }
    }
    return null;
  }

  flatList(nodes = this._tree()): FileNode[] {
    return nodes.flatMap(n =>
      n.children ? [n, ...this.flatList(n.children)] : [n]
    );
  }

  private buildPath(parentId: string | null, name: string, type: FileType): string {
    const ext: Record<FileType, string> = {
      y: '.y',
      styles: '.styles',
      comp: '.comp',
      sql: '.sql',
      db: '.db',
      folder: '',
    };
    const fullName = name.includes('.') ? name : name + ext[type];
    if (!parentId) return `./${fullName}`;
    const parent = this.findById(parentId);
    return `${parent?.path ?? '.'}/${fullName}`;
  }

  private defaultContent(type: FileType): string {
    const defaults: Record<FileType, string> = {
      styles: '/* Estilos YFERA */\n',
      comp:   'MiComponente() {\n\n}\n',
      y:      '/* Archivo principal YFERA */\nmain {\n\n}\n',
      sql:    '/* Consola SQL */\n',
      db:     '',
      folder: '',
    };
    return defaults[type];
  }

  private insertNode(tree: FileNode[], parentId: string | null, node: FileNode): FileNode[] {
    if (!parentId) return [...tree, node];
    return tree.map(n =>
      n.id === parentId
        ? { ...n, children: [...(n.children ?? []), node] }
        : n.children
        ? { ...n, children: this.insertNode(n.children, parentId, node) }
        : n
    );
  }

  private mapNode(tree: FileNode[], id: string, fn: (n: FileNode) => FileNode): FileNode[] {
    return tree.map(n =>
      n.id === id ? fn(n) : n.children
      ? { ...n, children: this.mapNode(n.children, id, fn) }
      : n
    );
  }

  private removeNode(tree: FileNode[], id: string): FileNode[] {
    return tree
      .filter(n => n.id !== id)
      .map(n => n.children
        ? { ...n, children: this.removeNode(n.children, id) }
        : n
      );
  }

  async exportProjectZip(): Promise<void> {
  const zip = new JSZip();

  for (const file of this.flatList()) {
    if (file.type === 'folder') continue;

    // quitar ./ del path
    const cleanPath = file.path.replace('./', '');

    zip.file(cleanPath, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'proyecto-yfera.zip');
}


createFromPath(path: string, content: string, tree: FileNode[]) {
  const parts = path.split('/');
  let currentLevel = tree;
  let parentId: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    const isFile = i === parts.length - 1;

    let existing = currentLevel.find(n => n.name === name);

    if (!existing) {
      const type = this.getTypeFromName(name, isFile);

      const node: FileNode = {
        id: crypto.randomUUID(),
        name,
        type,
        path: './' + parts.slice(0, i + 1).join('/'),
        content: isFile ? content : '',
        isOpen: false,
        isDirty: false,
        parentId,
        children: isFile ? undefined : []
      };

      currentLevel.push(node);
      existing = node;
    }

    parentId = existing.id;
    currentLevel = existing.children ?? [];
  }
}

async importProjectZip(file: File): Promise<void> {
  const zip = await JSZip.loadAsync(file);

  const tree: FileNode[] = [];

  for (const [path, fileEntry] of Object.entries(zip.files)) {
    if (fileEntry.dir) continue;

    const content = await fileEntry.async('string');

    this.createFromPath(path, content, tree);
  }

  this.loadProject(tree);
}

getTypeFromName(name: string, isFile: boolean): FileType {
  if (!isFile) return 'folder';

  if (name.endsWith('.y')) return 'y';
  if (name.endsWith('.comp')) return 'comp';
  if (name.endsWith('.styles')) return 'styles';
  if (name.endsWith('.sql')) return 'sql';
  if (name.endsWith('.db')) return 'db';

  // Archivo con extensión desconocida: tratar como archivo de texto YFERA por defecto
  return 'y';
 }
}
