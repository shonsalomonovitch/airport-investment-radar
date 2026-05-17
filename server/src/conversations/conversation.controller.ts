import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Get()
  listConversations() {
    return this.conversations.listConversations();
  }

  @Get(':id/messages')
  async getMessages(@Param('id', ParseIntPipe) id: number) {
    await this.conversations.getConversation(id); // 404 if not found
    return this.conversations.listMessages(id);
  }

  @Patch(':id/title')
  async updateTitle(
    @Param('id', ParseIntPipe) id: number,
    @Body('title') title: unknown,
  ) {
    if (typeof title !== 'string' || !title.trim()) {
      throw new BadRequestException('title must be a non-empty string');
    }
    return this.conversations.updateTitle(id, title.trim());
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteConversation(@Param('id', ParseIntPipe) id: number) {
    await this.conversations.deleteConversation(id);
  }
}
