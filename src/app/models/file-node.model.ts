export type FileType = 'y' | 'styles' | 'comp' | 'sql' | 'db' | 'folder';

export interface FileNode {
  id: string;
  name: string;
  type: FileType;
  path: string;          // ruta relativa: "./carpeta/archivo.comp"
  content: string;       // contenido actual en el editor
  isOpen: boolean;       // está en tabs
  isDirty: boolean;      // tiene cambios sin guardar
  children?: FileNode[]; // solo si type === 'folder'
  parentId: string | null;
}