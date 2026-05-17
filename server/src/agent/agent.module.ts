import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ConversationModule } from '../conversations/conversation.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ConversationModule, ToolsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
