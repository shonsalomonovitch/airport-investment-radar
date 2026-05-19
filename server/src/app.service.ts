import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly startedAt = new Date();

  constructor(private readonly config: ConfigService) {}

  alive() {
    const uptimeSeconds = Math.floor(
      (Date.now() - this.startedAt.getTime()) / 1000,
    );

    return {
      status: 'ok',
      app: 'Airport Investment Radar',
      description: 'AI-powered agent for US airport infrastructure investment analysis',
      version: '1.0.0',
      model: this.config.get<string>('CLAUDE_MODEL') ?? 'claude-opus-4-6',
      environment: process.env.NODE_ENV ?? 'production',
      uptime: {
        seconds: uptimeSeconds,
        human: this.formatUptime(uptimeSeconds),
      },
      startedAt: this.startedAt.toISOString(),
      dataSources: [
        'FAA Terminal Area Forecast (TAF) — XLSX, loaded at startup',
        'OurAirports CSV — airports + runways, loaded at startup',
        'AeroDataBox API — live flights + routes, cached 24h/7d',
      ],
    };
  }

  private formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
