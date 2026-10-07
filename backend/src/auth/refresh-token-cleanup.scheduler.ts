import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefreshSessionsService } from './refresh-sessions.service';

@Injectable()
export class RefreshTokenCleanupScheduler {
  constructor(private readonly sessions: RefreshSessionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  removeInactiveFamilies(): Promise<void> {
    return this.sessions.removeInactiveFamilies();
  }
}
