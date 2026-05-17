import { Pipe, PipeTransform, inject, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';

@Pipe({ name: 'markdown', standalone: true, pure: true })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string): string {
    const raw = marked.parse(value, { async: false });
    return this.sanitizer.sanitize(SecurityContext.HTML, raw) ?? '';
  }
}
