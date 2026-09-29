import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PayOS,
  NotFoundError as PayOSNotFoundError,
  type PaymentLink as PayOSPaymentLink,
  type Webhook as PayOSWebhook,
} from '@payos/node';
import {
  CreatePaymentLinkInput,
  PaymentProvider,
  PaymentProviderLink,
  VerifiedPaymentWebhook,
  PAYOS_REQUEST_MAX_RETRIES,
  PAYOS_REQUEST_TIMEOUT_MS,
} from './payment-provider';

type PayOSCredentials = {
  clientId: string;
  apiKey: string;
  checksumKey: string;
};

type PayOSPaymentLinkConfiguration = PayOSCredentials & {
  returnUrl: string;
  cancelUrl: string;
};

@Injectable()
export class PayosPaymentProvider implements PaymentProvider {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return this.getPaymentLinkConfiguration() !== undefined;
  }

  async createLink(
    input: CreatePaymentLinkInput,
  ): Promise<PaymentProviderLink> {
    const configuration = this.requirePaymentLinkConfiguration();
    this.assertOrderCode(input.orderCode);

    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException(
        'PayOS payment amount must be a positive safe integer in VND.',
      );
    }

    const expiredAt = this.toPayOSExpiry(input.expiresAt);
    const description = this.getDescription(input.orderCode);
    // The setup lease exceeds this bounded request; retries reconcile by orderCode.
    const created = await this.createClient(
      configuration,
    ).paymentRequests.create(
      {
        orderCode: input.orderCode,
        amount: input.amount,
        description,
        returnUrl: configuration.returnUrl,
        cancelUrl: configuration.cancelUrl,
        expiredAt,
      },
      {
        timeout: PAYOS_REQUEST_TIMEOUT_MS,
        maxRetries: PAYOS_REQUEST_MAX_RETRIES,
      },
    );

    return {
      linkId: created.paymentLinkId,
      checkoutUrl: created.checkoutUrl,
      status: created.status,
      amount: created.amount,
      amountPaid: 0,
      amountRemaining: created.amount,
      currency: created.currency,
      orderCode: created.orderCode,
      transactionReferences: [],
    };
  }

  async getLink(orderCode: number): Promise<PaymentProviderLink | null> {
    this.assertOrderCode(orderCode);
    const payOS = this.createClient(this.requireCredentials());
    try {
      const link = await payOS.paymentRequests.get(orderCode);
      return this.mapPaymentLink(link);
    } catch (error) {
      if (error instanceof PayOSNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async cancelLink(
    orderCode: number,
    cancellationReason?: string,
  ): Promise<PaymentProviderLink> {
    this.assertOrderCode(orderCode);
    const payOS = this.createClient(this.requireCredentials());
    const link = await payOS.paymentRequests.cancel(
      orderCode,
      cancellationReason,
    );
    return this.mapPaymentLink(link);
  }

  async verifyWebhook(payload: unknown): Promise<VerifiedPaymentWebhook> {
    const webhook = this.asWebhook(payload);
    const verified = await this.createClient(
      this.requireCredentials(),
    ).webhooks.verify(webhook);

    return {
      success: webhook.success,
      code: webhook.code,
      data: {
        orderCode: verified.orderCode,
        amount: verified.amount,
        reference: verified.reference,
        currency: verified.currency,
        paymentLinkId: verified.paymentLinkId,
        code: verified.code,
      },
    };
  }

  private getCredentials(): PayOSCredentials | undefined {
    const clientId = this.getConfigValue('PAYOS_CLIENT_ID');
    const apiKey = this.getConfigValue('PAYOS_API_KEY');
    const checksumKey = this.getConfigValue('PAYOS_CHECKSUM_KEY');

    if (!clientId || !apiKey || !checksumKey) {
      return undefined;
    }

    return { clientId, apiKey, checksumKey };
  }

  private getPaymentLinkConfiguration():
    PayOSPaymentLinkConfiguration | undefined {
    const credentials = this.getCredentials();
    const returnUrl = this.getConfigValue('PAYOS_RETURN_URL');
    const cancelUrl = this.getConfigValue('PAYOS_CANCEL_URL');

    if (!credentials || !returnUrl || !cancelUrl) {
      return undefined;
    }

    return { ...credentials, returnUrl, cancelUrl };
  }

  private requireCredentials(): PayOSCredentials {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw this.notConfigured();
    }
    return credentials;
  }

  private requirePaymentLinkConfiguration(): PayOSPaymentLinkConfiguration {
    const configuration = this.getPaymentLinkConfiguration();
    if (!configuration) {
      throw this.notConfigured();
    }
    return configuration;
  }

  private notConfigured(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'PayOS payment provider is not configured.',
    );
  }

  private getConfigValue(key: string): string | undefined {
    const value = this.configService.get<string>(key);
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private createClient(credentials: PayOSCredentials): PayOS {
    return new PayOS({
      clientId: credentials.clientId,
      apiKey: credentials.apiKey,
      checksumKey: credentials.checksumKey,
      timeout: PAYOS_REQUEST_TIMEOUT_MS,
      maxRetries: PAYOS_REQUEST_MAX_RETRIES,
    });
  }

  private mapPaymentLink(link: PayOSPaymentLink): PaymentProviderLink {
    return {
      linkId: link.id,
      checkoutUrl: null,
      status: link.status,
      amount: link.amount,
      amountPaid: link.amountPaid,
      amountRemaining: link.amountRemaining,
      currency: null,
      orderCode: link.orderCode,
      transactionReferences: Array.isArray(link.transactions)
        ? link.transactions.map((transaction) => transaction.reference)
        : [],
    };
  }

  private asWebhook(payload: unknown): PayOSWebhook {
    if (typeof payload !== 'object' || payload === null) {
      throw new BadRequestException('Invalid PayOS webhook payload.');
    }

    const candidate = payload as Record<string, unknown>;
    if (
      typeof candidate.success !== 'boolean' ||
      typeof candidate.code !== 'string' ||
      typeof candidate.signature !== 'string' ||
      candidate.signature.length === 0 ||
      typeof candidate.data !== 'object' ||
      candidate.data === null
    ) {
      throw new BadRequestException('Invalid PayOS webhook payload.');
    }

    return payload as PayOSWebhook;
  }

  private assertOrderCode(orderCode: number): void {
    if (
      !Number.isSafeInteger(orderCode) ||
      orderCode <= 0 ||
      orderCode > 2_147_483_647
    ) {
      throw new BadRequestException(
        'PayOS order code must be a positive PostgreSQL integer.',
      );
    }
  }

  private toPayOSExpiry(expiresAt: Date): number {
    const expiredAt = Math.floor(expiresAt.getTime() / 1000);
    if (
      !Number.isFinite(expiredAt) ||
      expiredAt <= 0 ||
      expiredAt > 2_147_483_647
    ) {
      throw new BadRequestException(
        'PayOS expiry must be a valid Int32 Unix timestamp.',
      );
    }
    return expiredAt;
  }

  private getDescription(orderCode: number): string {
    const description = `P${orderCode.toString(36).toUpperCase()}`;
    if (description.length > 9) {
      throw new BadRequestException(
        'PayOS payment description exceeds the supported length.',
      );
    }
    return description;
  }
}
