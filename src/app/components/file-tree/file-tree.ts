import { Component, inject, signal } from '@angular/core';
import { FileSystemService } from '../../services/file-system.service';
import { FileNode } from '../../models/file-node.model';
import { NameDialog, NameDialogResult } from '../name-dialog/name-dialog';

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [NameDialog],
  templateUrl: './file-tree.html',
  styleUrl: './file-tree.css',
})
export class FileTree {
  fs = inject(FileSystemService);

  openFolders = signal<Set<string>>(new Set());
  selectedFolder = signal<string | null>(null);

  dialogMode = signal<'file' | 'folder' | null>(null);
  contextMenuNode = signal<FileNode | null>(null);
  contextMenuPos = signal<{ x: number; y: number } | null>(null);

  newFile(): void { this.dialogMode.set('file'); }
  newFolder(): void { this.dialogMode.set('folder'); }

  newFileInFolder(parentId: string): void {
    this.dialogMode.set('file');
    // Store parent ID by temporarily selecting it
    this._currentParentId = parentId;
  }

  newFolderIn(parentId: string): void {
    this.dialogMode.set('folder');
    this._currentParentId = parentId;
  }

  private _currentParentId: string | null = null;

  onDialogConfirm(result: NameDialogResult): void {
    const parentId = this._currentParentId;
    this.dialogMode.set(null);
    this._currentParentId = null;

    if (result.type === 'folder') {
      this.fs.createFolder(parentId, result.name);
      if (parentId) {
        this.openFolders.update(folders => new Set([...folders, parentId]));
      }
    } else {
      const node = this.fs.createFile(parentId, result.name, result.type);
      if (parentId) {
        this.openFolders.update(folders => new Set([...folders, parentId]));
      }
      this.fs.openFile(node.id);
    }
    this.closeContextMenu();
  }

  onDialogCancel(): void {
    this.dialogMode.set(null);
    this._currentParentId = null;
  }

  toggle(node: FileNode) {
    if (node.type === 'folder') {
      this.openFolders.update(folders => {
        const newFolders = new Set(folders);
        if (newFolders.has(node.id)) {
          newFolders.delete(node.id);
        } else {
          newFolders.add(node.id);
        }
        return newFolders;
      });
      this.selectedFolder.set(node.id);
    } else if (node.type === 'db') {
      // Nodo de base de datos — solo informativo, no abrir en editor
    } else {
      this.fs.openFile(node.id);
    }
  }

  selectFolder(event: MouseEvent, node: FileNode): void {
    event.stopPropagation();
    if (node.type === 'folder') {
      this.selectedFolder.set(node.id);
    }
  }

  openContextMenu(event: MouseEvent, node: FileNode): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuNode.set(node);
    this.contextMenuPos.set({ x: event.clientX, y: event.clientY });
  }

  closeContextMenu(): void {
    this.contextMenuNode.set(null);
    this.contextMenuPos.set(null);
  }

  deleteNode(node: FileNode): void {
    if (confirm(`¿Eliminar "${node.name}"?`)) {
      this.fs.deleteNode(node.id);
      this.closeContextMenu();
    }
  }

  renameNode(node: FileNode): void {
    const newName = prompt(`Nuevo nombre para "${node.name}":`, node.name);
    if (newName && newName !== node.name) {
      // Update the name in the file system
      const updatedNode = { ...node, name: newName };
      // This would need a rename method in FileSystemService
      console.log('Rename not yet implemented');
      this.closeContextMenu();
    }
  }

  getIcon(node: FileNode): string {
    if (node.type === 'folder') {
      return this.openFolders().has(node.id) ? 'bi bi-folder2-open' : 'bi bi-folder';
    }
    const icons: Record<string, string> = {
      y:      'bi bi-file-code',
      comp:   'bi bi-puzzle',
      styles: 'bi bi-palette',
      sql:    'bi bi-database',
      db:     'bi bi-database-fill',
    };
    return icons[node.type] ?? 'bi bi-file-earmark';
  }

  isActive(node: FileNode): boolean {
    return this.fs.activeFileId() === node.id;
  }

  isFolderOpen(node: FileNode): boolean {
    return this.openFolders().has(node.id);
  }

  trackById(_: number, node: FileNode) { return node.id; }
}