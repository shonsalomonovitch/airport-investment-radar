import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { AeroDataBoxService } from './aerodatabox.service';

@Module({
  imports: [CacheModule],
  providers: [AeroDataBoxService],
  exports: [AeroDataBoxService],
})
export class AeroDataBoxModule {}
