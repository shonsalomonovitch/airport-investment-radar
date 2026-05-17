import { Module } from '@nestjs/common';
import { AirportsModule } from '../airports/airports.module';
import { FaaDataModule } from '../faa-data/faa-data.module';
import { AeroDataBoxModule } from '../aerodatabox/aerodatabox.module';
import { ScoringService } from './scoring.service';

@Module({
  imports: [AirportsModule, FaaDataModule, AeroDataBoxModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
