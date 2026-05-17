import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createConversation(title: string) {
    return this.db(() =>
      this.prisma.client.conversation.create({ data: { title } }),
    );
  }

  async getConversation(id: number) {
    const conversation = await this.db(() =>
      this.prisma.client.conversation.findUnique({ where: { id } }),
    );
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  async addMessage(conversationId: number, role: string, content: string) {
    return this.db(() =>
      this.prisma.client.message.create({
        data: { conversationId, role, content },
      }),
    );
  }

  async listMessages(conversationId: number) {
    return this.db(() =>
      this.prisma.client.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async buildHistory(conversationId: number) {
    const messages = await this.listMessages(conversationId);
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async listConversations() {
    const conversations = await this.db(() =>
      this.prisma.client.conversation.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
          _count: { select: { messages: true } },
        },
      }),
    );

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c._count.messages,
      lastMessageAt: c.messages[0]?.createdAt ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async updateTitle(id: number, title: string) {
    await this.getConversation(id); // throws 404 if not found
    return this.db(() =>
      this.prisma.client.conversation.update({
        where: { id },
        data: { title },
        select: { id: true, title: true, updatedAt: true },
      }),
    );
  }

  async deleteConversation(id: number) {
    await this.getConversation(id); // throws 404 if not found
    await this.db(() =>
      this.prisma.client.conversation.delete({ where: { id } }),
    );
  }

  private async db<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(
        `Database error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'The database is temporarily unavailable. Please try again.',
      );
    }
  }
}
