export type Database = {
  public: {
    Tables: {
      auctions: {
        Row: {
          id: string;
          title: string;
          platform:
            | 'youtube_shorts'
            | 'instagram_reels'
            | 'tiktok'
            | 'youtube'
            | 'threads'
            | 'naver_blog'
            | 'x_twitter'
            | 'other';
          budget: number;
          description: string;
          status: 'active' | 'matched' | 'completed' | 'cancelled' | 'closed';
          is_blind: boolean;
          author_id: string | null;
          author_name: string;
          winner_bid_id: string | null;
          deadline: string;
          created_at: string;
          updated_at: string;
          bids_count: number;
          leading_bid_amount: number;
          highest_bid_amount: number;
          image_url: string | null;
          thumbnail_url: string | null;
          category: string | null;
          ai_guide: {
            fingerprint?: string;
            concepts?: Array<{ title: string; description: string }>;
            expectedEffect?: string;
          } | null;
        };
        Insert: {
          id?: string;
          title: string;
          platform:
            | 'youtube_shorts'
            | 'instagram_reels'
            | 'tiktok'
            | 'youtube'
            | 'threads'
            | 'naver_blog'
            | 'x_twitter'
            | 'other';
          budget: number;
          description: string;
          status?: 'active' | 'matched' | 'completed' | 'cancelled' | 'closed';
          is_blind?: boolean;
          author_id?: string | null;
          author_name?: string;
          winner_bid_id?: string | null;
          deadline: string;
          created_at?: string;
          updated_at?: string;
          bids_count?: number;
          leading_bid_amount?: number;
          highest_bid_amount?: number;
          image_url?: string | null;
          thumbnail_url?: string | null;
          category?: string | null;
          ai_guide?: {
            fingerprint?: string;
            concepts?: Array<{ title: string; description: string }>;
            expectedEffect?: string;
          } | null;
        };
        Update: {
          title?: string;
          platform?:
            | 'youtube_shorts'
            | 'instagram_reels'
            | 'tiktok'
            | 'youtube'
            | 'threads'
            | 'naver_blog'
            | 'x_twitter'
            | 'other';
          budget?: number;
          description?: string;
          status?: 'active' | 'matched' | 'completed' | 'cancelled' | 'closed';
          is_blind?: boolean;
          author_id?: string | null;
          author_name?: string;
          winner_bid_id?: string | null;
          deadline?: string;
          updated_at?: string;
          bids_count?: number;
          leading_bid_amount?: number;
          highest_bid_amount?: number;
          image_url?: string | null;
          thumbnail_url?: string | null;
          category?: string | null;
          ai_guide?: {
            fingerprint?: string;
            concepts?: Array<{ title: string; description: string }>;
            expectedEffect?: string;
          } | null;
        };
        Relationships: [];
      };
      time_slots: {
        Row: {
          id: string;
          creator_id: string | null;
          creator_name: string;
          title: string;
          platform:
            | 'youtube_shorts'
            | 'instagram_reels'
            | 'tiktok'
            | 'youtube'
            | 'threads'
            | 'naver_blog'
            | 'x_twitter'
            | 'other';
          description: string;
          expected_views: number;
          starting_price: number;
          current_highest_bid: number;
          bids_count: number;
          slot_start: string;
          slot_end: string;
          deadline: string;
          status: 'open' | 'closed' | 'awarded';
          winner_bid_id: string | null;
          delivery_url: string | null;
          delivered_at: string | null;
          purchase_confirmed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id?: string | null;
          creator_name: string;
          title: string;
          platform:
            | 'youtube_shorts'
            | 'instagram_reels'
            | 'tiktok'
            | 'youtube'
            | 'threads'
            | 'naver_blog'
            | 'x_twitter'
            | 'other';
          description?: string;
          expected_views: number;
          starting_price: number;
          current_highest_bid?: number;
          bids_count?: number;
          slot_start: string;
          slot_end: string;
          deadline: string;
          status?: 'open' | 'closed' | 'awarded';
          winner_bid_id?: string | null;
          delivery_url?: string | null;
          delivered_at?: string | null;
          purchase_confirmed_at?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
          expected_views?: number;
          starting_price?: number;
          current_highest_bid?: number;
          bids_count?: number;
          slot_start?: string;
          slot_end?: string;
          deadline?: string;
          status?: 'open' | 'closed' | 'awarded';
          winner_bid_id?: string | null;
          delivery_url?: string | null;
          delivered_at?: string | null;
          purchase_confirmed_at?: string | null;
        };
        Relationships: [];
      };
      time_slot_bids: {
        Row: {
          id: string;
          time_slot_id: string;
          advertiser_id: string | null;
          advertiser_name: string;
          bid_amount: number;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          time_slot_id: string;
          advertiser_id?: string | null;
          advertiser_name: string;
          bid_amount: number;
          message?: string;
          created_at?: string;
        };
        Update: {
          bid_amount?: number;
          message?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          auction_id: string;
          sender_id: string | null;
          sender_name: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          auction_id: string;
          sender_id?: string | null;
          sender_name?: string;
          body: string;
          created_at?: string;
        };
        Update: {
          auction_id?: string;
          sender_id?: string | null;
          sender_name?: string;
          body?: string;
        };
        Relationships: [];
      };
      bids: {
        Row: {
          id: string;
          auction_id: string;
          creator_id: string | null;
          creator_name: string;
          creator_channel_url: string;
          bid_amount: number;
          proposal_text: string;
          status: 'pending' | 'selected';
          created_at: string;
          bank_name: string;
          account_number: string;
          account_holder: string;
        };
        Insert: {
          id?: string;
          auction_id: string;
          creator_id?: string | null;
          creator_name: string;
          creator_channel_url: string;
          bid_amount: number;
          proposal_text: string;
          status?: 'pending' | 'selected';
          created_at?: string;
          bank_name?: string;
          account_number?: string;
          account_holder?: string;
        };
        Update: {
          auction_id?: string;
          creator_id?: string | null;
          creator_name?: string;
          creator_channel_url?: string;
          bid_amount?: number;
          proposal_text?: string;
          status?: 'pending' | 'selected';
          bank_name?: string;
          account_number?: string;
          account_holder?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          role: 'advertiser' | 'creator' | 'admin' | null;
          roles: Array<'advertiser' | 'creator' | 'admin'>;
          status: 'active' | 'suspended';
          credit_balance: number;
          created_at: string;
          business_registration_number: string;
          business_verification_status:
            | 'unregistered'
            | 'verified'
            | 'closed'
            | 'review_required'
            | 'rejected';
          business_status_detail: string;
          business_review_note: string;
          business_checked_at: string | null;
          business_representative_name: string;
          business_opened_on: string;
          bank_name: string;
          account_number: string;
          account_holder: string;
          settlement_type: 'individual' | 'business';
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          role?: 'advertiser' | 'creator' | 'admin' | null;
          roles?: Array<'advertiser' | 'creator' | 'admin'>;
          status?: 'active' | 'suspended';
          credit_balance?: number;
          created_at?: string;
          business_registration_number?: string;
          business_verification_status?:
            | 'unregistered'
            | 'verified'
            | 'closed'
            | 'review_required'
            | 'rejected';
          business_status_detail?: string;
          business_review_note?: string;
          business_checked_at?: string | null;
          business_representative_name?: string;
          business_opened_on?: string;
          bank_name?: string;
          account_number?: string;
          account_holder?: string;
          settlement_type?: 'individual' | 'business';
        };
        Update: {
          name?: string;
          email?: string;
          phone?: string | null;
          role?: 'advertiser' | 'creator' | 'admin' | null;
          roles?: Array<'advertiser' | 'creator' | 'admin'>;
          status?: 'active' | 'suspended';
          credit_balance?: number;
          business_registration_number?: string;
          business_verification_status?:
            | 'unregistered'
            | 'verified'
            | 'closed'
            | 'review_required'
            | 'rejected';
          business_status_detail?: string;
          business_review_note?: string;
          business_checked_at?: string | null;
          business_representative_name?: string;
          business_opened_on?: string;
          bank_name?: string;
          account_number?: string;
          account_holder?: string;
          settlement_type?: 'individual' | 'business';
        };
        Relationships: [];
      };
      creator_metrics: {
        Row: {
          profile_id: string;
          rating: number;
          completion_rate: number;
          penalty_count: number;
          youtube_verified: boolean;
          youtube_channel_id: string | null;
          youtube_channel_url: string | null;
          youtube_channel_title: string | null;
          youtube_subscriber_count: number;
          youtube_video_count: number;
          youtube_view_count: number;
          youtube_metrics_synced_at: string | null;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          rating?: number;
          completion_rate?: number;
          penalty_count?: number;
          youtube_verified?: boolean;
          youtube_channel_id?: string | null;
          youtube_channel_url?: string | null;
          youtube_channel_title?: string | null;
          youtube_subscriber_count?: number;
          youtube_video_count?: number;
          youtube_view_count?: number;
          youtube_metrics_synced_at?: string | null;
          updated_at?: string;
        };
        Update: {
          rating?: number;
          completion_rate?: number;
          penalty_count?: number;
          youtube_verified?: boolean;
          youtube_channel_id?: string | null;
          youtube_channel_url?: string | null;
          youtube_channel_title?: string | null;
          youtube_subscriber_count?: number;
          youtube_video_count?: number;
          youtube_view_count?: number;
          youtube_metrics_synced_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          order_id: string;
          auction_id: string;
          bid_id: string;
          amount: number;
          order_name: string;
          status: 'pending' | 'confirmed' | 'failed' | 'expired';
          payment_key: string | null;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          order_id: string;
          auction_id: string;
          bid_id: string;
          amount: number;
          order_name: string;
          status?: 'pending' | 'confirmed' | 'failed' | 'expired';
          payment_key?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          auction_id?: string;
          bid_id?: string;
          amount?: number;
          order_name?: string;
          status?: 'pending' | 'confirmed' | 'failed' | 'expired';
          payment_key?: string | null;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      payouts: {
        Row: {
          id: string;
          creator_id: string | null;
          creator_name: string;
          creator_email: string;
          amount: number;
          status: 'pending' | 'paid' | 'hold';
          auction_title: string;
          requested_at: string;
          paid_at: string | null;
          payment_order_id: string | null;
          auction_id: string | null;
          bid_id: string | null;
          admin_memo: string;
          bank_account: string;
          bank_name: string;
          account_number: string;
          account_holder: string;
          settlement_due_at: string | null;
        };
        Insert: {
          id?: string;
          creator_id?: string | null;
          creator_name: string;
          creator_email?: string;
          amount: number;
          status?: 'pending' | 'paid' | 'hold';
          auction_title?: string;
          requested_at?: string;
          paid_at?: string | null;
          payment_order_id?: string | null;
          auction_id?: string | null;
          bid_id?: string | null;
          admin_memo?: string;
          bank_account?: string;
          bank_name?: string;
          account_number?: string;
          account_holder?: string;
          settlement_due_at?: string | null;
        };
        Update: {
          creator_id?: string | null;
          creator_name?: string;
          creator_email?: string;
          amount?: number;
          status?: 'pending' | 'paid' | 'hold';
          auction_title?: string;
          requested_at?: string;
          paid_at?: string | null;
          payment_order_id?: string | null;
          auction_id?: string | null;
          bid_id?: string | null;
          admin_memo?: string;
          bank_account?: string;
          bank_name?: string;
          account_number?: string;
          account_holder?: string;
          settlement_due_at?: string | null;
        };
        Relationships: [];
      };
      compliance_logs: {
        Row: {
          id: string;
          source: string;
          keywords: string[];
          snippet: string;
          blocked: boolean;
          actor_id: string | null;
          auction_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          keywords?: string[];
          snippet?: string;
          blocked?: boolean;
          actor_id?: string | null;
          auction_id?: string | null;
          created_at?: string;
        };
        Update: {
          snippet?: string;
          blocked?: boolean;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          email: string;
          category: 'payment' | 'auction' | 'account' | 'other';
          message: string;
          status: 'open' | 'closed';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          email: string;
          category: 'payment' | 'auction' | 'account' | 'other';
          message: string;
          status?: 'open' | 'closed';
          created_at?: string;
        };
        Update: {
          status?: 'open' | 'closed';
        };
        Relationships: [];
      };
      tax_invoice_logs: {
        Row: {
          id: string;
          payout_id: string | null;
          payment_order_id: string | null;
          auction_id: string | null;
          bid_id: string | null;
          supply_amount: number;
          vat_amount: number;
          withholding_amount: number;
          net_payout: number;
          status: string;
          provider: string;
          mgt_key: string | null;
          payload: Record<string, string | number | boolean | null> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payout_id?: string | null;
          payment_order_id?: string | null;
          auction_id?: string | null;
          bid_id?: string | null;
          supply_amount: number;
          vat_amount: number;
          withholding_amount: number;
          net_payout: number;
          status?: string;
          provider?: string;
          mgt_key?: string | null;
          payload?: Record<string, string | number | boolean | null> | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          mgt_key?: string | null;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
          amount: number;
          balance_after: number;
          reference_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
          amount: number;
          balance_after: number;
          reference_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          type?: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
          amount?: number;
          balance_after?: number;
          reference_id?: string | null;
          description?: string | null;
        };
        Relationships: [];
      };
      credit_charge_orders: {
        Row: {
          order_id: string;
          user_id: string;
          amount: number;
          status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
          payment_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_id: string;
          user_id: string;
          amount: number;
          status?: 'pending' | 'confirmed' | 'failed' | 'cancelled';
          payment_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          status?: 'pending' | 'confirmed' | 'failed' | 'cancelled';
          payment_key?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      award_auction: {
        Args: { p_auction_id: string; p_bid_id: string };
        Returns: Database['public']['Tables']['auctions']['Row'];
      };
      merge_auth_identities: {
        Args: { p_from: string; p_to: string };
        Returns: number;
      };
      find_auth_user_ids_by_contact: {
        Args: { p_emails?: string[]; p_phone?: string | null; p_naver_id?: string | null };
        Returns: Array<{ id: string }>;
      };
      link_naver_identity: {
        Args: {
          p_user_id: string;
          p_naver_id: string;
          p_email?: string | null;
          p_name?: string | null;
        };
        Returns: string;
      };
      link_provider_identity: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_provider_id: string;
          p_email?: string | null;
          p_name?: string | null;
        };
        Returns: string;
      };
      unlink_provider_identity: {
        Args: { p_user_id: string; p_provider: string };
        Returns: boolean;
      };
      delete_own_account: {
        Args: { p_user_id?: string | null };
        Returns: undefined;
      };
      charge_user_credit: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reference_id?: string | null;
          p_description?: string | null;
        };
        Returns: {
          balance_after: number;
          transaction_id: string;
          type: 'CHARGE';
        };
      };
      deduct_user_credit: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_type?: 'HOLD';
          p_reference_id?: string | null;
          p_description?: string | null;
        };
        Returns: {
          balance_after: number;
          transaction_id: string;
          type: 'HOLD';
        };
      };
      restore_user_credit: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_type: 'RELEASE' | 'REFUND';
          p_reference_id?: string | null;
          p_description?: string | null;
        };
        Returns: {
          balance_after: number;
          transaction_id: string;
          type: 'RELEASE' | 'REFUND';
        };
      };
    };
    Enums: {
      platform_type:
        | 'youtube_shorts'
        | 'instagram_reels'
        | 'tiktok'
        | 'youtube'
        | 'threads'
        | 'naver_blog'
        | 'x_twitter'
        | 'other';
      auction_status: 'active' | 'matched' | 'completed' | 'cancelled' | 'closed';
      bid_status: 'pending' | 'selected';
      profile_role: 'advertiser' | 'creator' | 'admin';
      profile_status: 'active' | 'suspended';
      payout_status: 'pending' | 'paid' | 'hold';
      payment_status: 'pending' | 'confirmed' | 'failed' | 'expired';
    };
    CompositeTypes: Record<string, never>;
  };
};
