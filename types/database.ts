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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      book_requests: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string
          id: string
          isbn: string | null
          notes: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          whatsapp: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name: string
          id?: string
          isbn?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          whatsapp: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          id?: string
          isbn?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          cover_url: string | null
          created_at: string
          format: Database["public"]["Enums"]["book_format"]
          id: string
          isbn: string | null
          notes: string | null
          title: string
        }
        Insert: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["book_format"]
          id?: string
          isbn?: string | null
          notes?: string | null
          title: string
        }
        Update: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["book_format"]
          id?: string
          isbn?: string | null
          notes?: string | null
          title?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          blacklist_reason: string | null
          code: string
          created_at: string
          full_name: string
          id: string
          instagram: string | null
          is_blacklisted: boolean
          notes: string | null
          whatsapp: string
        }
        Insert: {
          blacklist_reason?: string | null
          code: string
          created_at?: string
          full_name: string
          id?: string
          instagram?: string | null
          is_blacklisted?: boolean
          notes?: string | null
          whatsapp: string
        }
        Update: {
          blacklist_reason?: string | null
          code?: string
          created_at?: string
          full_name?: string
          id?: string
          instagram?: string | null
          is_blacklisted?: boolean
          notes?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      event_items: {
        Row: {
          book_id: string
          event_id: string
          id: string
          is_active: boolean
          price_idr: number
          stock: number | null
        }
        Insert: {
          book_id: string
          event_id: string
          id?: string
          is_active?: boolean
          price_idr: number
          stock?: number | null
        }
        Update: {
          book_id?: string
          event_id?: string
          id?: string
          is_active?: boolean
          price_idr?: number
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          closes_at: string | null
          created_at: string
          description: string | null
          dp_percent: number
          eta_note: string | null
          id: string
          name: string
          opens_at: string | null
          payment_due_hours: number | null
          status: Database["public"]["Enums"]["event_status"]
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          dp_percent?: number
          eta_note?: string | null
          id?: string
          name: string
          opens_at?: string | null
          payment_due_hours?: number | null
          status?: Database["public"]["Enums"]["event_status"]
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          dp_percent?: number
          eta_note?: string | null
          id?: string
          name?: string
          opens_at?: string | null
          payment_due_hours?: number | null
          status?: Database["public"]["Enums"]["event_status"]
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: []
      }
      order_items: {
        Row: {
          event_item_id: string
          id: string
          notes: string | null
          order_id: string
          qty: number
          shipment_id: string | null
          shipping_status: Database["public"]["Enums"]["item_shipping_status"]
          unit_price_idr: number
        }
        Insert: {
          event_item_id: string
          id?: string
          notes?: string | null
          order_id: string
          qty?: number
          shipment_id?: string | null
          shipping_status?: Database["public"]["Enums"]["item_shipping_status"]
          unit_price_idr: number
        }
        Update: {
          event_item_id?: string
          id?: string
          notes?: string | null
          order_id?: string
          qty?: number
          shipment_id?: string | null
          shipping_status?: Database["public"]["Enums"]["item_shipping_status"]
          unit_price_idr?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_event_item_id_fkey"
            columns: ["event_item_id"]
            isOneToOne: false
            referencedRelation: "event_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_payment"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          created_at: string
          customer_id: string
          customer_notes: string | null
          discount_idr: number
          discount_note: string | null
          event_id: string
          id: string
          idempotency_key: string | null
          order_code: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_idr: number
          total_idr: number | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          customer_id: string
          customer_notes?: string | null
          discount_idr?: number
          discount_note?: string | null
          event_id: string
          id?: string
          idempotency_key?: string | null
          order_code: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_idr: number
          total_idr?: number | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          customer_id?: string
          customer_notes?: string | null
          discount_idr?: number
          discount_note?: string | null
          event_id?: string
          id?: string
          idempotency_key?: string | null
          order_code?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_idr?: number
          total_idr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_idr: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          order_id: string
          paid_at: string | null
          proof_url: string | null
          status: Database["public"]["Enums"]["payment_review_status"]
          verified_at: string | null
        }
        Insert: {
          amount_idr: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          order_id: string
          paid_at?: string | null
          proof_url?: string | null
          status?: Database["public"]["Enums"]["payment_review_status"]
          verified_at?: string | null
        }
        Update: {
          amount_idr?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          proof_url?: string | null
          status?: Database["public"]["Enums"]["payment_review_status"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_payment"
            referencedColumns: ["order_id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket_key: string
          hit_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hit_count?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hit_count?: number
          window_start?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      shipments: {
        Row: {
          address_detail: string | null
          address_street: string
          city: string
          courier: string
          created_at: string
          customer_id: string
          delivered_at: string | null
          id: string
          postal_code: string
          province: string
          service: string | null
          shipped_at: string | null
          shipping_cost_idr: number | null
          tracking_number: string | null
        }
        Insert: {
          address_detail?: string | null
          address_street: string
          city: string
          courier: string
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          id?: string
          postal_code: string
          province: string
          service?: string | null
          shipped_at?: string | null
          shipping_cost_idr?: number | null
          tracking_number?: string | null
        }
        Update: {
          address_detail?: string | null
          address_street?: string
          city?: string
          courier?: string
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          id?: string
          postal_code?: string
          province?: string
          service?: string | null
          shipped_at?: string | null
          shipping_cost_idr?: number | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
        ]
      }
    }
    Views: {
      v_customer_balance: {
        Row: {
          code: string | null
          customer_id: string | null
          full_name: string | null
          total_balance_idr: number | null
          unpaid_orders: number | null
        }
        Relationships: []
      }
      v_order_payment: {
        Row: {
          balance_idr: number | null
          order_id: string | null
          paid_idr: number | null
          payment_state: string | null
          total_idr: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_set_event_status: {
        Args: {
          p_event_id: string
          p_new_status: Database["public"]["Enums"]["event_status"]
        }
        Returns: undefined
      }
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_hits: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_order: {
        Args: {
          p_client_ip?: string
          p_customer_notes: string
          p_event_id: string
          p_full_name: string
          p_idempotency_key: string
          p_instagram: string
          p_items: Json
          p_payment_type: string
          p_whatsapp: string
        }
        Returns: {
          bank_accounts: Json
          customer_code: string
          dp_percent: number
          nominal_due_idr: number
          order_code: string
          order_id: string
          store_name: string
          subtotal_idr: number
          total_idr: number
          wa_admin_number: string
        }[]
      }
      generate_customer_code: { Args: never; Returns: string }
      get_tracker: {
        Args: { p_client_ip?: string; p_code: string }
        Returns: {
          admin_notes: string
          balance_idr: number
          created_at: string
          event_name: string
          items: Json
          order_code: string
          order_id: string
          paid_idr: number
          payment_state: string
          total_idr: number
        }[]
      }
      import_catalog_csv: {
        Args: { p_event_id: string; p_rows: Json }
        Returns: {
          csv_row_number: number
          isbn: string
          message: string
          status: string
          title: string
        }[]
      }
      normalize_whatsapp: { Args: { p_input: string }; Returns: string }
      submit_payment_proof: {
        Args: {
          p_amount_idr: number
          p_client_ip?: string
          p_customer_code: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_code: string
          p_paid_at: string
          p_proof_path: string
        }
        Returns: {
          payment_id: string
          status: string
        }[]
      }
    }
    Enums: {
      book_format: "paperback" | "hardcover" | "boxset" | "other"
      event_status:
        | "draft"
        | "open"
        | "closed"
        | "ordered"
        | "shipped_to_indo"
        | "arrived"
        | "completed"
        | "cancelled"
      event_type:
        | "publisher_po_us"
        | "publisher_po_uk"
        | "ready_stock"
        | "secondhand"
        | "special_edition"
        | "bbw_jastip"
        | "other"
      item_shipping_status:
        | "not_shipped"
        | "shipped_to_indo"
        | "arrived_in_indo"
        | "waiting_courier"
        | "shipped"
        | "delivered"
      order_status: "pending" | "confirmed" | "completed" | "cancelled"
      payment_method: "bank_transfer" | "shopeepay" | "qris" | "other"
      payment_review_status: "pending" | "verified" | "rejected"
      request_status: "new" | "sourcing" | "quoted" | "fulfilled" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      book_format: ["paperback", "hardcover", "boxset", "other"],
      event_status: [
        "draft",
        "open",
        "closed",
        "ordered",
        "shipped_to_indo",
        "arrived",
        "completed",
        "cancelled",
      ],
      event_type: [
        "publisher_po_us",
        "publisher_po_uk",
        "ready_stock",
        "secondhand",
        "special_edition",
        "bbw_jastip",
        "other",
      ],
      item_shipping_status: [
        "not_shipped",
        "shipped_to_indo",
        "arrived_in_indo",
        "waiting_courier",
        "shipped",
        "delivered",
      ],
      order_status: ["pending", "confirmed", "completed", "cancelled"],
      payment_method: ["bank_transfer", "shopeepay", "qris", "other"],
      payment_review_status: ["pending", "verified", "rejected"],
      request_status: ["new", "sourcing", "quoted", "fulfilled", "rejected"],
    },
  },
} as const
