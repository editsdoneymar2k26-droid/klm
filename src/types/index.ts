// -----------------------------------------
// HYPERCUT STORE BOT -- Tipagens globais v2
// -----------------------------------------

import { Context, Scenes } from 'telegraf';

export type UserLevel = 'bronze' | 'silver' | 'gold' | 'vip';
export type UserRole  = 'user' | 'admin' | 'owner';

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  balance: number;
  total_spent: number;
  level: UserLevel;
  role: UserRole;
  is_banned: boolean;
  is_admin: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  gift_count: number;
  topup_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserDTO {
  telegram_id: number;
  username: string | null;
  first_name: string;
}

export type ProductCategory = 'streaming' | 'software' | 'games' | 'other';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: ProductCategory;
  image_url: string | null;
  is_active: boolean;
  stock_count: number;
  created_at: string;
}

export interface ProductWithStock extends Product {
  available_count: number;
}

export type StockStatus = 'available' | 'reserved' | 'sold';

export interface StockItem {
  id: string;
  product_id: string;
  credentials: string;
  status: StockStatus;
  reserved_by: number | null;
  reservation_expires_at: string | null;
  order_id: string | null;
  current_users: number;
  max_users: number;
  cooldown_until: string | null;
  last_delivery: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'pending' | 'paid' | 'delivered' | 'expired' | 'cancelled';

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  stock_item_id: string | null;
  amount: number;
  status: OrderStatus;
  delivery_message: string | null;
  pix_txid: string | null;
  pix_qrcode: string | null;
  pix_expires_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  user_id: string;
  telegram_id: number;
  order_id: string;
  stock_item_id: string;
  delivered_at: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'cancelled';

export interface PendingPayment {
  id: string;
  telegram_id: number;
  user_id: string;
  transaction_id: string;
  amount_cents: number;
  status: PaymentStatus;
  qrcode: string | null;
  copy_paste: string | null;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PixWebhookPayload {
  txid: string;
  status: 'paid' | 'expired';
  amount: number;
  paidAt?: string;
}

export interface SessionData {
  step?: string;
  ownerId?: number;
  selectedProductId?: string;
  selectedProductName?: string;
  selectedProductPrice?: number;
  orderId?: string;
  stockItemId?: string;
  topupDigits?: string;
  giftDraft?: Record<string, any>;
  promoDraft?: Record<string, any>;
  broadcastMessage?: string;
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
