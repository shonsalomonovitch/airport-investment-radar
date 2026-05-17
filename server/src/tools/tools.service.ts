import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ScoringService } from '../scoring/scoring.service';
import { AirportsService } from '../airports/airports.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyzeAirportData, ToolResult } from './tools.types';

const IataParam = z
  .string()
  .min(2)
  .max(5)
  .transform((s) => s.trim().toUpperCase());

const RankSchema = z.object({
  region: z.string().min(1),
});

const CompareSchema = z.object({
  airportA: IataParam,
  airportB: IataParam,
});

const AirportParamSchema = z.object({
  airport: IataParam,
});

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly scoring: ScoringService,
    private readonly airports: AirportsService,
    private readonly prisma: PrismaService,
  ) {}

  async run(
    toolName: string,
    rawInput: unknown,
    conversationId?: number,
  ): Promise<ToolResult<unknown>> {
    const start = Date.now();
    let result: ToolResult<unknown>;

    try {
      switch (toolName) {
        case 'rank_airports_by_region':
          result = await this.rankAirportsByRegion(rawInput);
          break;
        case 'compare_airports':
          result = await this.compareAirports(rawInput);
          break;
        case 'analyze_airport':
          result = await this.analyzeAirport(rawInput);
          break;
        case 'calculate_long_haul_share':
          result = await this.calculateLongHaulShare(rawInput);
          break;
        case 'estimate_unmet_demand':
          result = this.estimateUnmetDemand(rawInput);
          break;
        default:
          result = {
            success: false,
            errorCode: 'UNKNOWN_TOOL',
            userSafeMessage: `Unknown tool: "${toolName}". Available tools: rank_airports_by_region, compare_airports, analyze_airport, calculate_long_haul_share, estimate_unmet_demand.`,
          };
      }
    } catch (err) {
      this.logger.error(
        `Tool "${toolName}" threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
      );
      result = {
        success: false,
        errorCode: 'INTERNAL_ERROR',
        userSafeMessage:
          'Something went wrong while executing the tool. Please try again.',
      };
    }

    const durationMs = Date.now() - start;
    await this.logToolCall(
      toolName,
      rawInput,
      result,
      durationMs,
      conversationId,
    ).catch((err) =>
      this.logger.warn(
        `Failed to persist tool call log: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    return result;
  }

  async rankAirportsByRegion(rawInput: unknown): Promise<ToolResult<unknown>> {
    const parsed = RankSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        userSafeMessage: this.zodError(parsed.error),
      };
    }
    const data = await this.scoring.rankAirportsByRegion(parsed.data.region);
    return { success: true, data };
  }

  async compareAirports(rawInput: unknown): Promise<ToolResult<unknown>> {
    const parsed = CompareSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        userSafeMessage: this.zodError(parsed.error),
      };
    }
    const { airportA, airportB } = parsed.data;
    if (airportA === airportB) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        userSafeMessage: 'airportA and airportB must be different airports.',
      };
    }
    const data = await this.scoring.compareAirports(airportA, airportB);
    return { success: true, data };
  }

  async analyzeAirport(
    rawInput: unknown,
  ): Promise<ToolResult<AnalyzeAirportData>> {
    const parsed = AirportParamSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        userSafeMessage: this.zodError(parsed.error),
      };
    }
    const iata = parsed.data.airport;

    const profileResult = this.airports.getAirportProfile(iata);
    if (!profileResult.data) {
      return {
        success: false,
        errorCode: 'AIRPORT_NOT_FOUND',
        userSafeMessage: `Airport "${iata}" was not found in the dataset. Please verify the IATA code and try again.`,
      };
    }

    const score = await this.scoring.calculateAirportScore(iata);

    return { success: true, data: { score, profile: profileResult.data } };
  }

  async calculateLongHaulShare(
    rawInput: unknown,
  ): Promise<ToolResult<unknown>> {
    const parsed = AirportParamSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        userSafeMessage: this.zodError(parsed.error),
      };
    }
    const data = await this.scoring.calculateLongHaulShare(parsed.data.airport);
    return { success: true, data };
  }

  estimateUnmetDemand(rawInput: unknown): ToolResult<unknown> {
    const parsed = AirportParamSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        userSafeMessage: this.zodError(parsed.error),
      };
    }
    const data = this.scoring.estimateUnmetDemand(parsed.data.airport);
    return { success: true, data };
  }

  private async logToolCall(
    toolName: string,
    inputJson: unknown,
    resultJson: unknown,
    durationMs: number,
    conversationId?: number,
  ): Promise<void> {
    await this.prisma.client.toolCall.create({
      data: {
        toolName,
        inputJson: inputJson as never,
        resultJson: resultJson as never,
        durationMs,
        ...(conversationId !== undefined ? { conversationId } : {}),
      },
    });
  }

  private zodError(error: z.ZodError): string {
    const issues = error.issues
      .slice(0, 3)
      .map(
        (i) =>
          `${i.path.length > 0 ? i.path.join('.') + ': ' : ''}${i.message}`,
      );
    return `Invalid input — ${issues.join('; ')}`;
  }
}
