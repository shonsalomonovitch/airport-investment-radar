import { Body, Controller, Get, Post } from '@nestjs/common';
import { AgentService } from './agent.service';
import { MessageSchema } from './dto/message.dto';
import type { MessageDto } from './dto/message.dto';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('capabilities')
  getCapabilities() {
    return this.agentService.getCapabilities();
  }

  @Post('message')
  postMessage(@Body(new ZodValidationPipe(MessageSchema)) body: MessageDto) {
    return this.agentService.handleMessage(body);
  }
}
