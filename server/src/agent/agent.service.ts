import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ConversationService } from '../conversations/conversation.service';
import { ToolsService } from '../tools/tools.service';
import { SYSTEM_PROMPT } from './agent.prompt';
import { AGENT_TOOLS } from './agent.tools';
import type { MessageDto } from './dto/message.dto';

const MAX_LOOP_ITERATIONS = 8;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly conversations: ConversationService,
    private readonly tools: ToolsService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.config.get<string>('CLAUDE_MODEL') ?? 'claude-opus-4-6';
    this.logger.log(`Agent initialized with model: ${this.model}`);
  }

  getCapabilities() {
    return [
      {
        displayName: 'Analyze Airport',
        description:
          'Full investment profile and score for a single airport — runways, demand, routes, congestion, and a grade.',
        exampleQuestion: 'Analyze BOS airport',
      },
      {
        displayName: 'Compare Two Airports',
        description:
          'Side-by-side investment score breakdown for two airports with a dimension-level winner and final verdict.',
        exampleQuestion: 'Compare LAX vs SNA congestion levels',
      },
      {
        displayName: 'Rank Airports by Region',
        description:
          'Ranked list of airports in a US region or state by investment potential score.',
        exampleQuestion:
          'Which airports in New England are strong investment candidates?',
      },
      {
        displayName: 'Long-Haul Share',
        description:
          'Calculates the share of routes ≥ 3,000 km departing from an airport, with per-route distances.',
        exampleQuestion: 'What percentage of flights from ANC are long haul?',
      },
      {
        displayName: 'Estimate Unmet Demand',
        description:
          'Proxy score for unmet flight demand combining FAA growth forecasts, congestion, and capacity constraints.',
        exampleQuestion: 'What is the unmet demand at SFO and why?',
      },
    ];
  }

  async handleMessage(
    body: MessageDto,
  ): Promise<{ answer: string; conversationId: number }> {
    const conversationId = await this.resolveConversation(
      body.conversationId,
      body.message,
    );

    const toParams = (
      msgs: { role: string; content: string }[],
    ): Anthropic.MessageParam[] =>
      msgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const history: Anthropic.MessageParam[] = body.conversationId
      ? toParams(await this.conversations.buildHistory(conversationId))
      : toParams(body.history ?? []);

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: body.message },
    ];

    await this.conversations.addMessage(conversationId, 'user', body.message);

    const answer = await this.runAgentLoop(messages, conversationId);

    try {
      await this.conversations.addMessage(conversationId, 'assistant', answer);
    } catch (err) {
      this.logger.warn(
        `Failed to persist assistant reply for conversationId ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { answer, conversationId };
  }

  private async runAgentLoop(
    messages: Anthropic.MessageParam[],
    conversationId: number,
  ): Promise<string> {
    let iteration = 0;

    while (iteration < MAX_LOOP_ITERATIONS) {
      iteration++;
      this.logger.debug(
        `Agent loop iteration ${iteration}/${MAX_LOOP_ITERATIONS}`,
      );

      let response: Anthropic.Message;
      try {
        response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools: AGENT_TOOLS,
          messages,
        });
      } catch (err) {
        this.logger.error(
          `Anthropic API error on iteration ${iteration}: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (err instanceof Anthropic.RateLimitError) {
          throw new HttpException(
            'We have reached the AI usage limit. Please wait a moment and try again.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIConnectionTimeoutError) {
          throw new HttpException(
            'Could not reach the AI service. Please check your connection and try again.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        if (err instanceof Anthropic.InternalServerError) {
          throw new HttpException(
            'The AI service is temporarily unavailable. Please try again in a few minutes.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        if (err instanceof Anthropic.AuthenticationError) {
          this.logger.error('Anthropic API key is invalid or missing');
          throw new HttpException(
            'The AI service is misconfigured. Please contact support.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        throw new HttpException(
          'An unexpected error occurred while processing your request.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        return (
          textBlock?.text ||
          'I was unable to generate a response. Please try again.'
        );
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });

        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolCall of toolUseBlocks) {
          this.logger.debug(
            `Tool call: ${toolCall.name}(${JSON.stringify(toolCall.input)})`,
          );
          const result = await this.tools.run(
            toolCall.name,
            toolCall.input,
            conversationId,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      this.logger.warn(`Unexpected stop_reason: "${response.stop_reason}"`);
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (textBlock?.text) return textBlock.text;
      break;
    }

    this.logger.warn(
      `Agent loop exhausted after ${iteration} iteration(s) for conversationId ${conversationId}`,
    );
    return 'I was unable to complete the analysis within the allowed number of steps. Please try asking a more specific question.';
  }

  private async resolveConversation(
    conversationId: number | undefined,
    firstMessage: string,
  ): Promise<number> {
    if (conversationId) {
      await this.conversations.getConversation(conversationId);
      return conversationId;
    }
    const conversation = await this.conversations.createConversation(
      firstMessage.slice(0, 80),
    );
    return conversation.id;
  }
}
