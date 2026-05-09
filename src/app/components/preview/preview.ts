import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { fromEvent, filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParserRunnerService } from '../../services/parser-runner.service';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [],
  templateUrl: './preview.html',
  styleUrl: './preview.css',
})
export class Preview {
  private runner = inject(ParserRunnerService);
  private sanitizer = inject(DomSanitizer);
  private destroyRef = inject(DestroyRef);

  readonly result = this.runner.lastResult;
  readonly showSource = signal(false);

  readonly previewDoc = computed((): SafeHtml | null => {
    const r = this.result();
    if (!r?.html) return null;

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${r.css}</style></head><body>${r.html}</body></html>`;

    return this.sanitizer.bypassSecurityTrustHtml(doc);
  });

  constructor() {
    this.runner.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.run());

    fromEvent<MessageEvent>(window, 'message')
      .pipe(
        filter(ev => ev.data?.type === 'YFERA_REFRESH'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.run());
  }

  run(): void {
    void this.runner.runActive();
  }

  toggleSource(): void {
    this.showSource.update(v => !v);
  }

  downloadHtml(): void {
    const r = this.result();
    if (!r?.html) return;

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${r.css}</style></head><body>${r.html}</body></html>`;

    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'preview.html';
    a.click();

    URL.revokeObjectURL(url);
  }
}
