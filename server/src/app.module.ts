import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AgentModule } from './agent/agent.module';
import { ConversationModule } from './conversations/conversation.module';
import { AirportsModule } from './airports/airports.module';
import { FaaDataModule } from './faa-data/faa-data.module';
import { CacheModule } from './cache/cache.module';
import { AeroDataBoxModule } from './aerodatabox/aerodatabox.module';
import { ScoringModule } from './scoring/scoring.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AirportsModule,
    FaaDataModule,
    CacheModule,
    AeroDataBoxModule,
    ScoringModule,
    ToolsModule,
    ConversationModule,
    AgentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
