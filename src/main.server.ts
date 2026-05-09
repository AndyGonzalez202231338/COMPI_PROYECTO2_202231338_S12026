import { renderApplication } from '@angular/platform-server';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';

export default function render(url: string, document: string) {
  return renderApplication(() => bootstrapApplication(AppComponent), {
    document,
    url,
  });
}
