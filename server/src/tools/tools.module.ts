import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { AirportsModule } from '../airports/airports.module';
import { ToolsService } from './tools.service';

@Module({
  imports: [ScoringModule, AirportsModule],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
