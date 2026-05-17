import { Module } from '@nestjs/common';
import { ApiCacheService } from './api-cache.service';

@Module({
  providers: [ApiCacheService],
  exports: [ApiCacheService],
})
export class CacheModule {}
