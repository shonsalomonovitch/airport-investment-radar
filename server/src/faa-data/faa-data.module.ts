import { Module } from '@nestjs/common';
import { FaaDataService } from './faa-data.service';

@Module({
  providers: [FaaDataService],
  exports: [FaaDataService],
})
export class FaaDataModule {}
