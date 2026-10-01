import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments/payos')
export class PayosWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handle(@Body() payload: unknown) {
    return this.payments.handleWebhook(payload);
  }
}
