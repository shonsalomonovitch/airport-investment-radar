import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Capability {
  displayName: string;
  description: string;
  exampleQuestion: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMessage {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const BASE = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);

  checkHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${BASE}/alive`);
  }

  sendMessage(
    message: string,
    convId?: number,
  ): Observable<{ answer: string; conversationId: number }> {
    const body: Record<string, unknown> = { message };
    if (convId !== undefined) body['conversationId'] = convId;
    return this.http.post<{ answer: string; conversationId: number }>(
      `${BASE}/agent/message`,
      body,
    );
  }

  getCapabilities(): Observable<Capability[]> {
    return this.http.get<Capability[]>(`${BASE}/agent/capabilities`);
  }

  getConvs(): Observable<ConversationSummary[]> {
    return this.http.get<ConversationSummary[]>(`${BASE}/conversations`);
  }

  getMsgs(convId: number): Observable<ApiMessage[]> {
    return this.http.get<ApiMessage[]>(`${BASE}/conversations/${convId}/messages`);
  }

  renameConv(
    convId: number,
    title: string,
  ): Observable<{ id: number; title: string; updatedAt: string }> {
    return this.http.patch<{ id: number; title: string; updatedAt: string }>(
      `${BASE}/conversations/${convId}/title`,
      { title },
    );
  }

  deleteConv(convId: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/conversations/${convId}`).pipe(
      catchError((err) => {
        if (err.status === 404) return of(undefined as void);
        throw err;
      }),
    );
  }
}
