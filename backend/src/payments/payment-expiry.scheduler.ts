import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentExpiryScheduler {
  private readonly logger = new Logger(PaymentExpiryScheduler.name);

  constructor(private readonly payments: PaymentsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileDuePayosAttempts(): Promise<void> {
    try {
      await this.payments.reconcileScheduledAttempts();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          outcome: 'payos_scheduler_retry',
          error: error instanceof Error ? error.name : 'UnknownProviderError',
        }),
      );
    }
  }
}
