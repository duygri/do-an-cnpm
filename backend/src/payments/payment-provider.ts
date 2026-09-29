export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentProviderLinkStatus =
  | 'PENDING'
  | 'CANCELLED'
  | 'UNDERPAID'
  | 'PAID'
  | 'EXPIRED'
  | 'PROCESSING'
  | 'FAILED';

export interface CreatePaymentLinkInput {
  orderCode: number;
  amount: number;
  expiresAt: Date;
}

export interface PaymentProviderLink {
  linkId: string;
  checkoutUrl: string | null;
  status: PaymentProviderLinkStatus;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string | null;
  orderCode: number;
  transactionReferences: string[];
}

export interface VerifiedPaymentWebhook {
  success: boolean;
  code: string;
  data: {
    orderCode: number;
    amount: number;
    reference: string;
    currency: string;
    paymentLinkId: string;
    code: string;
  };
}

export interface PaymentProvider {
  isConfigured(): boolean;
  createLink(input: CreatePaymentLinkInput): Promise<PaymentProviderLink>;
  getLink(orderCode: number): Promise<PaymentProviderLink>;
  cancelLink(
    orderCode: number,
    cancellationReason?: string,
  ): Promise<PaymentProviderLink>;
  verifyWebhook(payload: unknown): Promise<VerifiedPaymentWebhook>;
}
