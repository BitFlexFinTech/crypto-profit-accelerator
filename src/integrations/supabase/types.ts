export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      balances: {
        Row: {
          available: number | null
          currency: string | null
          exchange_id: string | null
          id: string
          locked: number | null
          total: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available?: number | null
          currency?: string | null
          exchange_id?: string | null
          id?: string
          locked?: number | null
          total?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available?: number | null
          currency?: string | null
          exchange_id?: string | null
          id?: string
          locked?: number | null
          total?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balances_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_settings: {
        Row: {
          ai_aggressiveness: string | null
          created_at: string | null
          daily_loss_limit: number | null
          futures_profit_target: number | null
          id: string
          is_bot_running: boolean | null
          is_paper_trading: boolean | null
          max_open_positions: number | null
          max_order_size: number | null
          min_order_size: number | null
          spot_profit_target: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_aggressiveness?: string | null
          created_at?: string | null
          daily_loss_limit?: number | null
          futures_profit_target?: number | null
          id?: string
          is_bot_running?: boolean | null
          is_paper_trading?: boolean | null
          max_open_positions?: number | null
          max_order_size?: number | null
          min_order_size?: number | null
          spot_profit_target?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_aggressiveness?: string | null
          created_at?: string | null
          daily_loss_limit?: number | null
          futures_profit_target?: number | null
          id?: string
          is_bot_running?: boolean | null
          is_paper_trading?: boolean | null
          max_open_positions?: number | null
          max_order_size?: number | null
          min_order_size?: number | null
          spot_profit_target?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          close_price: number | null
          created_at: string | null
          date: string
          gross_profit: number | null
          high_price: number | null
          id: string
          losing_trades: number | null
          low_price: number | null
          net_profit: number | null
          open_price: number | null
          total_fees: number | null
          total_trades: number | null
          user_id: string
          winning_trades: number | null
        }
        Insert: {
          close_price?: number | null
          created_at?: string | null
          date: string
          gross_profit?: number | null
          high_price?: number | null
          id?: string
          losing_trades?: number | null
          low_price?: number | null
          net_profit?: number | null
          open_price?: number | null
          total_fees?: number | null
          total_trades?: number | null
          user_id: string
          winning_trades?: number | null
        }
        Update: {
          close_price?: number | null
          created_at?: string | null
          date?: string
          gross_profit?: number | null
          high_price?: number | null
          id?: string
          losing_trades?: number | null
          low_price?: number | null
          net_profit?: number | null
          open_price?: number | null
          total_fees?: number | null
          total_trades?: number | null
          user_id?: string
          winning_trades?: number | null
        }
        Relationships: []
      }
      exchanges: {
        Row: {
          api_key_encrypted: string | null
          api_secret_encrypted: string | null
          created_at: string | null
          exchange: Database["public"]["Enums"]["exchange_name"]
          futures_enabled: boolean | null
          id: string
          is_connected: boolean | null
          is_enabled: boolean | null
          last_balance_sync: string | null
          passphrase_encrypted: string | null
          spot_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          created_at?: string | null
          exchange: Database["public"]["Enums"]["exchange_name"]
          futures_enabled?: boolean | null
          id?: string
          is_connected?: boolean | null
          is_enabled?: boolean | null
          last_balance_sync?: string | null
          passphrase_encrypted?: string | null
          spot_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          created_at?: string | null
          exchange?: Database["public"]["Enums"]["exchange_name"]
          futures_enabled?: boolean | null
          id?: string
          is_connected?: boolean | null
          is_enabled?: boolean | null
          last_balance_sync?: string | null
          passphrase_encrypted?: string | null
          spot_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          trade_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          trade_id?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          trade_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          current_price: number | null
          direction: Database["public"]["Enums"]["position_direction"]
          entry_price: number
          exchange_id: string | null
          id: string
          is_paper_trade: boolean | null
          leverage: number | null
          opened_at: string | null
          order_size_usd: number
          profit_target: number
          quantity: number
          status: Database["public"]["Enums"]["position_status"] | null
          symbol: string
          trade_id: string | null
          trade_type: Database["public"]["Enums"]["trade_type"]
          unrealized_pnl: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_price?: number | null
          direction: Database["public"]["Enums"]["position_direction"]
          entry_price: number
          exchange_id?: string | null
          id?: string
          is_paper_trade?: boolean | null
          leverage?: number | null
          opened_at?: string | null
          order_size_usd: number
          profit_target: number
          quantity: number
          status?: Database["public"]["Enums"]["position_status"] | null
          symbol: string
          trade_id?: string | null
          trade_type: Database["public"]["Enums"]["trade_type"]
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_price?: number | null
          direction?: Database["public"]["Enums"]["position_direction"]
          entry_price?: number
          exchange_id?: string | null
          id?: string
          is_paper_trade?: boolean | null
          leverage?: number | null
          opened_at?: string | null
          order_size_usd?: number
          profit_target?: number
          quantity?: number
          status?: Database["public"]["Enums"]["position_status"] | null
          symbol?: string
          trade_id?: string | null
          trade_type?: Database["public"]["Enums"]["trade_type"]
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_progress: {
        Row: {
          created_at: string | null
          current_step: number | null
          exchanges_connected: string[] | null
          id: string
          is_completed: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_step?: number | null
          exchanges_connected?: string[] | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_step?: number | null
          exchanges_connected?: string[] | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          ai_reasoning: string | null
          ai_score: number | null
          closed_at: string | null
          created_at: string | null
          direction: Database["public"]["Enums"]["position_direction"]
          entry_fee: number | null
          entry_price: number
          exchange_id: string | null
          exit_fee: number | null
          exit_price: number | null
          funding_fee: number | null
          gross_profit: number | null
          id: string
          is_paper_trade: boolean | null
          leverage: number | null
          net_profit: number | null
          opened_at: string | null
          order_size_usd: number
          quantity: number
          status: Database["public"]["Enums"]["position_status"] | null
          symbol: string
          trade_type: Database["public"]["Enums"]["trade_type"]
          user_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_score?: number | null
          closed_at?: string | null
          created_at?: string | null
          direction: Database["public"]["Enums"]["position_direction"]
          entry_fee?: number | null
          entry_price: number
          exchange_id?: string | null
          exit_fee?: number | null
          exit_price?: number | null
          funding_fee?: number | null
          gross_profit?: number | null
          id?: string
          is_paper_trade?: boolean | null
          leverage?: number | null
          net_profit?: number | null
          opened_at?: string | null
          order_size_usd: number
          quantity: number
          status?: Database["public"]["Enums"]["position_status"] | null
          symbol: string
          trade_type: Database["public"]["Enums"]["trade_type"]
          user_id: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_score?: number | null
          closed_at?: string | null
          created_at?: string | null
          direction?: Database["public"]["Enums"]["position_direction"]
          entry_fee?: number | null
          entry_price?: number
          exchange_id?: string | null
          exit_fee?: number | null
          exit_price?: number | null
          funding_fee?: number | null
          gross_profit?: number | null
          id?: string
          is_paper_trade?: boolean | null
          leverage?: number | null
          net_profit?: number | null
          opened_at?: string | null
          order_size_usd?: number
          quantity?: number
          status?: Database["public"]["Enums"]["position_status"] | null
          symbol?: string
          trade_type?: Database["public"]["Enums"]["trade_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      exchange_name:
        | "binance"
        | "okx"
        | "nexo"
        | "bybit"
        | "kucoin"
        | "hyperliquid"
      notification_type:
        | "trade_opened"
        | "trade_closed"
        | "profit_target_hit"
        | "error"
        | "warning"
        | "info"
      order_status:
        | "pending"
        | "filled"
        | "partially_filled"
        | "cancelled"
        | "failed"
      position_direction: "long" | "short"
      position_status: "open" | "closed" | "cancelled"
      trade_type: "spot" | "futures"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      exchange_name: [
        "binance",
        "okx",
        "nexo",
        "bybit",
        "kucoin",
        "hyperliquid",
      ],
      notification_type: [
        "trade_opened",
        "trade_closed",
        "profit_target_hit",
        "error",
        "warning",
        "info",
      ],
      order_status: [
        "pending",
        "filled",
        "partially_filled",
        "cancelled",
        "failed",
      ],
      position_direction: ["long", "short"],
      position_status: ["open", "closed", "cancelled"],
      trade_type: ["spot", "futures"],
    },
  },
} as const
