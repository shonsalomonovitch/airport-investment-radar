import { z } from 'zod';

export const HistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'content must not be empty').max(50000, 'history item content is too long'),
});

export const MessageSchema = z.object({
  message: z.string().min(1, 'message must not be empty').max(4000, 'message must not exceed 4000 characters'),
  history: z.array(HistoryItemSchema).max(100, 'history must not exceed 100 messages').optional(),
  conversationId: z.number().int().positive().optional(),
});

export type MessageDto = z.infer<typeof MessageSchema>;
