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
          role: 'advertiser' | 'creator' | 'admin';
          status: 'active' | 'suspended';
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          role: 'advertiser' | 'creator' | 'admin';
          status?: 'active' | 'suspended';
          created_at?: string;
        };
        Update: {
          name?: string;
          email?: string;
          role?: 'advertiser' | 'creator' | 'admin';
          status?: 'active' | 'suspended';
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
