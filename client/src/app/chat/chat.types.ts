export interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: Date;
}
