import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CachedEntry } from './cache.types';

export type { CachedEntry };

@Injectable()
export class ApiCacheService {
  private readonly logger = new Logger(ApiCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the cache entry regardless of expiry.
   * Useful for stale-while-revalidate or audit purposes.
   */
  async get(cacheKey: string): Promise<CachedEntry | null> {
    const row = await this.prisma.client.apiCache.findUnique({
      where: { cacheKey },
    });

    if (!row) return null;

    return {
      id: row.id,
      provider: row.provider,
      cacheKey: row.cacheKey,
      responseJson: row.responseJson,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      isExpired: this.isExpired(row.expiresAt),
    };
  }

  /**
   * Returns the cache entry only if it exists and has not expired.
   * Returns null if missing or expired. Single DB round-trip.
   */
  async getFresh(cacheKey: string): Promise<CachedEntry | null> {
    const row = await this.prisma.client.apiCache.findFirst({
      where: { cacheKey, expiresAt: { gt: new Date() } },
    });

    if (!row) return null;

    return {
      id: row.id,
      provider: row.provider,
      cacheKey: row.cacheKey,
      responseJson: row.responseJson,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      isExpired: false,
    };
  }

  /**
   * Writes or updates a cache entry.
   * If a row with the same cacheKey already exists it is replaced (upsert).
   */
  async set(
    provider: string,
    cacheKey: string,
    responseJson: unknown,
    ttlMinutes: number,
  ): Promise<CachedEntry> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    const row = await this.prisma.client.apiCache.upsert({
      where: { cacheKey },
      create: {
        provider,
        cacheKey,
        responseJson: responseJson as never,
        fetchedAt: now,
        expiresAt,
      },
      update: {
        provider,
        responseJson: responseJson as never,
        fetchedAt: now,
        expiresAt,
      },
    });

    this.logger.debug(
      `Cache set for key "${cacheKey}" (expires ${expiresAt.toISOString()})`,
    );

    return {
      id: row.id,
      provider: row.provider,
      cacheKey: row.cacheKey,
      responseJson: row.responseJson,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      isExpired: false,
    };
  }

  isExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt;
  }
}
