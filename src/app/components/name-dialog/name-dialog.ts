import {
  Component, Input, Output, EventEmitter,
  AfterViewInit, ViewChild, ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FileType } from '../../models/file-node.model';

export interface NameDialogResult {
  name: string;
  type: FileType;
}

const EXT_MAP: Record<string, FileType> = {
  y: 'y', styles: 'styles', comp: 'comp', sql: 'sql',
};

@Component({
  selector: 'app-name-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './name-dialog.html',
  styleUrl: './name-dialog.css',
})
export class NameDialog implements AfterViewInit {
  @Input() mode: 'file' | 'folder' = 'file';
  @Output() confirmed = new EventEmitter<NameDialogResult>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('nameInput') private nameInput!: ElementRef<HTMLInputElement>;

  value = '';

  get title(): string {
    return this.mode === 'folder' ? 'Nueva carpeta' : 'Nuevo archivo';
  }

  get placeholder(): string {
    return this.mode === 'folder' ? 'nombre-carpeta' : 'archivo.styles';
  }

  get hint(): string {
    return this.mode === 'file'
      ? 'Extensiones válidas: .y  .styles  .comp  .sql'
      : '';
  }

  ngAfterViewInit(): void {
    this.nameInput.nativeElement.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirm(); }
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); }
  }

  confirm(): void {
    const raw = this.value.trim();
    if (!raw) return;

    let type: FileType = 'y';
    let name = raw;
    if (this.mode === 'file') {
      const parts = raw.split('.');
      if (parts.length > 1) {
        const ext = parts.pop()!;
        type = EXT_MAP[ext] ?? 'y';
        name = parts.join('.');
      }
    } else {
      type = 'folder';
    }

    this.confirmed.emit({ name, type });
    this.value = '';
  }

  cancel(): void {
    this.value = '';
    this.cancelled.emit();
  }
}
