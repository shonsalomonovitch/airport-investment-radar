import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { AgentService, Capability, ConversationSummary } from '../services/agent.service';
import { Message } from './chat.types';
import { SidebarComponent } from './sidebar/sidebar.component';
import { MessageThreadComponent } from './message-thread/message-thread.component';
import { ToolsBarComponent } from './tools-bar/tools-bar.component';
import { MessageInputComponent } from './message-input/message-input.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [SidebarComponent, MessageThreadComponent, ToolsBarComponent, MessageInputComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent implements OnInit {
  private readonly agentService = inject(AgentService);
  private readonly destroyRef = inject(DestroyRef);

  msgs = signal<Message[]>([]);
  loading = signal(false);
  activeConvId = signal<number | null>(null);
  convs = signal<ConversationSummary[]>([]);
  loadingConvs = signal(true);
  capabilities = signal<Capability[]>([]);
  convsError = signal(false);

  private static readonly FALLBACK_SCENARIOS = [
    'Analyze BOS airport',
    'Compare LAX vs SFO congestion levels',
    'Which airports in New England are strong investment candidates?',
    'What is the unmet demand at ORD?',
    'What percentage of flights from ANC are long haul?',
  ];

  scenarios = computed(() => {
    const caps = this.capabilities();
    return caps.length > 0
      ? caps.map((c) => c.exampleQuestion)
      : ChatComponent.FALLBACK_SCENARIOS;
  });
  sidebarOpen = signal(typeof window !== 'undefined' && window.innerWidth >= 768);
  isDark = signal(false);

  ngOnInit(): void {
    this.loadConvs();
    this.agentService.getCapabilities().subscribe({
      next: (caps) => this.capabilities.set(caps),
      error: () => { /* fallback scenarios are shown via computed */ },
    });

    fromEvent(window, 'resize')
      .pipe(debounceTime(150), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.sidebarOpen.set(window.innerWidth >= 768));
  }

  loadConvs(): void {
    this.loadingConvs.set(true);
    this.convsError.set(false);
    this.agentService.getConvs().subscribe({
      next: (convs) => {
        this.convs.set(convs);
        this.loadingConvs.set(false);
      },
      error: () => {
        this.loadingConvs.set(false);
        this.convsError.set(true);
      },
    });
  }

  loadConv(id: number): void {
    this.agentService.getMsgs(id).subscribe({
      next: (apiMsgs) => {
        this.activeConvId.set(id);
        this.msgs.set(
          apiMsgs.map((m) => ({
            role: m.role as Message['role'],
            content: m.content,
            timestamp: new Date(m.createdAt),
          })),
        );
        if (window.innerWidth < 768) this.sidebarOpen.set(false);
      },
      error: () => {
        this.msgs.set([{
          role: 'error',
          content: 'Could not load this conversation. Please try again.',
          timestamp: new Date(),
        }]);
      },
    });
  }

  startNewChat(): void {
    this.activeConvId.set(null);
    this.msgs.set([]);
    if (window.innerWidth < 768) this.sidebarOpen.set(false);
  }

  sendMsg(text: string): void {
    if (!text.trim() || this.loading()) return;

    this.msgs.update((prev) => [
      ...prev,
      { role: 'user', content: text, timestamp: new Date() },
    ]);
    this.loading.set(true);

    const convId = this.activeConvId() ?? undefined;
    const isFirstMsg = convId === undefined;

    this.agentService.sendMessage(text, convId).subscribe({
      next: (res) => {
        this.activeConvId.set(res.conversationId);
        this.msgs.update((prev) => [
          ...prev,
          { role: 'assistant', content: res.answer, timestamp: new Date() },
        ]);
        this.loading.set(false);
        if (isFirstMsg) this.loadConvs();
      },
      error: (err) => {
        if (err?.status === 404 && convId !== undefined) {
          this.activeConvId.set(null);
          this.msgs.update((prev) => [
            ...prev,
            {
              role: 'error',
              content: 'This conversation no longer exists. Starting a new one — please resend your message.',
              timestamp: new Date(),
            },
          ]);
          this.loading.set(false);
          return;
        }
        const msg = err?.error?.message ?? err?.message ?? 'Something went wrong. Please try again.';
        this.msgs.update((prev) => [
          ...prev,
          { role: 'error', content: msg, timestamp: new Date() },
        ]);
        this.loading.set(false);
      },
    });
  }

  onConvRenamed(event: { id: number; title: string }): void {
    this.convs.update((prev) =>
      prev.map((c) => (c.id === event.id ? { ...c, title: event.title } : c)),
    );
  }

  onConvDeleted(id: number): void {
    this.convs.update((prev) => prev.filter((c) => c.id !== id));
    if (this.activeConvId() === id) {
      this.activeConvId.set(null);
      this.msgs.set([]);
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  toggleTheme(): void {
    this.isDark.update((v) => !v);
  }
}
