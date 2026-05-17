import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnChanges,
} from '@angular/core';
import { Message } from '../chat.types';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { ChartBlockComponent } from '../chart-block/chart-block.component';

type Segment = { type: 'text'; content: string } | { type: 'chart'; content: string };

const CHART_REGEX = /[ \t]*```chart[ \t]*\r?\n([\s\S]*?)[ \t]*```/g;

@Component({
  selector: 'app-message-thread',
  standalone: true,
  imports: [MarkdownPipe, ChartBlockComponent],
  templateUrl: './message-thread.component.html',
  styleUrl: './message-thread.component.css',
})
export class MessageThreadComponent implements OnChanges, AfterViewChecked {
  @Input() msgs: Message[] = [];
  @Input() loading = false;
  @Input() scenarios: string[] = [];
  @Output() scenarioClick = new EventEmitter<string>();

  @ViewChild('bottomAnchor') private bottomAnchor!: ElementRef;

  private shouldScroll = false;

  ngOnChanges(): void {
    this.shouldScroll = true;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.bottomAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth' });
      this.shouldScroll = false;
    }
  }

  isGroupEnd(index: number): boolean {
    const next = this.msgs[index + 1];
    return !next || next.role !== this.msgs[index].role;
  }

  bubbleRadius(role: Message['role'], index: number): string {
    if (role === 'error') return '18px';
    const isEnd = this.isGroupEnd(index);
    if (role === 'user') return isEnd ? '18px 18px 4px 18px' : '18px';
    return isEnd ? '18px 18px 18px 4px' : '18px';
  }

  bubbleBg(role: Message['role']): string {
    if (role === 'user') return 'var(--blue)';
    if (role === 'assistant') return 'var(--gray-bg)';
    return 'var(--error-bg)';
  }

  bubbleTextColor(role: Message['role']): string {
    if (role === 'user') return '#FFFFFF';
    if (role === 'assistant') return 'var(--text)';
    return 'var(--red)';
  }

  fmtTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  parseSegments(content: string): Segment[] {
    const segments: Segment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    CHART_REGEX.lastIndex = 0;
    while ((match = CHART_REGEX.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'chart', content: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      segments.push({ type: 'text', content: content.slice(lastIndex) });
    }
    return segments.filter((s) => s.content.trim());
  }
}
