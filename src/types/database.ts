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
        };
        Update: {
          auction_id?: string;
          creator_id?: string | null;
          creator_name?: string;
          creator_channel_url?: string;
          bid_amount?: number;
          proposal_text?: string;
          status?: 'pending' | 'selected';
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
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          role?: 'advertiser' | 'creator' | 'admin' | null;
          roles?: Array<'advertiser' | 'creator' | 'admin'>;
          status?: 'active' | 'suspended';
          created_at?: string;
        };
        Update: {
          name?: string;
          email?: string;
          phone?: string | null;
          role?: 'advertiser' | 'creator' | 'admin' | null;
          roles?: Array<'advertiser' | 'creator' | 'admin'>;
          status?: 'active' | 'suspended';
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
          status: 'pending' | 'paid';
          auction_title: string;
          requested_at: string;
          paid_at: string | null;
          payment_order_id: string | null;
          auction_id: string | null;
          bid_id: string | null;
          admin_memo: string;
          bank_account: string;
        };
        Insert: {
          id?: string;
          creator_id?: string | null;
          creator_name: string;
          creator_email?: string;
          amount: number;
          status?: 'pending' | 'paid';
          auction_title?: string;
          requested_at?: string;
          paid_at?: string | null;
          payment_order_id?: string | null;
          auction_id?: string | null;
          bid_id?: string | null;
          admin_memo?: string;
          bank_account?: string;
        };
        Update: {
          creator_id?: string | null;
          creator_name?: string;
          creator_email?: string;
          amount?: number;
          status?: 'pending' | 'paid';
          auction_title?: string;
          requested_at?: string;
          paid_at?: string | null;
          payment_order_id?: string | null;
          auction_id?: string | null;
          bid_id?: string | null;
          admin_memo?: string;
          bank_account?: string;
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
    };
    Views: Record<string, never>;
    Functions: {
      award_auction: {
        Args: { p_auction_id: string; p_bid_id: string };
        Returns: Database['public']['Tables']['auctions']['Row'];
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
      payout_status: 'pending' | 'paid';
      payment_status: 'pending' | 'confirmed' | 'failed' | 'expired';
    };
    CompositeTypes: Record<string, never>;
  };
};
