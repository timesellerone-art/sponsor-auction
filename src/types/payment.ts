export const PAYMENT_METHODS = ['CARD', 'TRANSFER', 'EASY_PAY'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentIntentStatus = 'pending' | 'confirmed' | 'failed' | 'expired';

export type PaymentIntent = {
  orderId: string;
  auctionId: string;
  bidId: string;
  amount: number;
  orderName: string;
  status: PaymentIntentStatus;
  paymentKey: string | null;
  createdAt: number;
  method?: PaymentMethod;
};

export type PreparePaymentInput = {
  auctionId: string;
  bidId: string;
  amount: number;
  orderName: string;
  customerKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export type PreparePaymentResult = {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  clientKey: string | null;
  demo: boolean;
  auctionId: string;
  bidId: string;
};

export type ConfirmPaymentInput = {
  paymentKey: string;
  orderId: string;
  amount: number;
  auctionId?: string;
  bidId?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export type ConfirmPaymentResult = {
  orderId: string;
  auctionId: string;
  bidId: string;
  amount: number;
  paymentKey: string;
  alreadyConfirmed: boolean;
  saved?: boolean;
  taxInvoice?: {
    status: 'issued' | 'fallback' | 'error';
    mgtKey: string;
    message: string;
  } | null;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
};
