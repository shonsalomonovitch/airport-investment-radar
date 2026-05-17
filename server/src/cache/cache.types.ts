export interface CachedEntry {
  id: string;
  provider: string;
  cacheKey: string;
  responseJson: unknown;
  fetchedAt: Date;
  expiresAt: Date;
  isExpired: boolean;
}
