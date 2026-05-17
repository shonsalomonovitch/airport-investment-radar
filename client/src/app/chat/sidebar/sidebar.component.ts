import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostBinding,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgentService, ConversationSummary } from '../../services/agent.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  @Input() convs: ConversationSummary[] = [];
  @Input() activeId: number | null = null;
  @Input() loading = false;
  @Input() open = false;
  @Input() error = false;

  @Output() close = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();
  @Output() newChat = new EventEmitter<void>();
  @Output() selectConv = new EventEmitter<number>();
  @Output() convRenamed = new EventEmitter<{ id: number; title: string }>();
  @Output() convDeleted = new EventEmitter<number>();

  @HostBinding('class.closed') get isClosed() { return !this.open; }

  private readonly agentService = inject(AgentService);

  renamingId = signal<number | null>(null);
  renameTitle = signal('');
  renameError = signal('');
  savingRename = signal(false);
  deletingId = signal<number | null>(null);

  startRename(conv: ConversationSummary, event: Event): void {
    event.stopPropagation();
    this.renamingId.set(conv.id);
    this.renameTitle.set(conv.title);
    this.renameError.set('');
  }

  cancelRename(event?: Event): void {
    event?.stopPropagation();
    this.renamingId.set(null);
    this.renameTitle.set('');
    this.renameError.set('');
  }

  saveRename(id: number, event?: Event): void {
    event?.stopPropagation();
    const trimmed = this.renameTitle().trim();
    if (!trimmed) { this.renameError.set('Title cannot be empty'); return; }

    this.savingRename.set(true);
    this.agentService.renameConv(id, trimmed).subscribe({
      next: (res) => {
        this.convRenamed.emit({ id: res.id, title: res.title });
        this.renamingId.set(null);
        this.renameTitle.set('');
        this.renameError.set('');
        this.savingRename.set(false);
      },
      error: (err) => {
        this.renameError.set(err?.error?.message ?? 'Failed to save');
        this.savingRename.set(false);
      },
    });
  }

  onRenameKeydown(event: KeyboardEvent, id: number): void {
    event.stopPropagation();
    if (event.key === 'Enter') this.saveRename(id);
    if (event.key === 'Escape') this.cancelRename();
  }

  deleteConv(id: number, event: Event): void {
    event.stopPropagation();
    if (this.deletingId() !== null) return;
    this.deletingId.set(id);
    this.agentService.deleteConv(id).subscribe({
      next: () => {
        this.convDeleted.emit(id);
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }
}
