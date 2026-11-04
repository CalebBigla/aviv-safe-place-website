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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      booking_access_tokens: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          redeemed_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          redeemed_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          redeemed_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          period: string
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          period: string
          reason?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          period?: string
          reason?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          alternative_start: string | null
          booking_status: string
          cancellation_status: string | null
          client_email: string
          client_name: string
          client_phone: string | null
          confirmed_at: string | null
          confirmed_end: string | null
          confirmed_start: string | null
          created_at: string
          currency: string
          meeting_room_id: string | null
          duration_minutes_snapshot: number | null
          id: string
          meeting_link_issued_at: string | null
          meeting_provider: string | null
          payment_reference: string | null
          payment_status: string
          policy_acknowledged_at: string | null
          price_minor: number
          public_reference: string
          refund_status: string | null
          request_expires_at: string | null
          requested_start: string | null
          reviewed_at: string | null
          service_id: string
          service_title_snapshot: string | null
          session_status: string
          slot: string | null
          time_zone: string
          updated_at: string
        }
        Insert: {
          alternative_start?: string | null
          booking_status?: string
          cancellation_status?: string | null
          client_email: string
          client_name: string
          client_phone?: string | null
          confirmed_at?: string | null
          confirmed_end?: string | null
          confirmed_start?: string | null
          created_at?: string
          currency?: string
          meeting_room_id?: string | null
          duration_minutes_snapshot?: number | null
          id?: string
          meeting_link_issued_at?: string | null
          meeting_provider?: string | null
          payment_reference?: string | null
          payment_status?: string
          policy_acknowledged_at?: string | null
          price_minor: number
          public_reference: string
          refund_status?: string | null
          request_expires_at?: string | null
          requested_start?: string | null
          reviewed_at?: string | null
          service_id: string
          service_title_snapshot?: string | null
          session_status?: string
          slot?: string | null
          time_zone?: string
          updated_at?: string
        }
        Update: {
          alternative_start?: string | null
          booking_status?: string
          cancellation_status?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string | null
          confirmed_at?: string | null
          confirmed_end?: string | null
          confirmed_start?: string | null
          created_at?: string
          currency?: string
          meeting_room_id?: string | null
          duration_minutes_snapshot?: number | null
          id?: string
          meeting_link_issued_at?: string | null
          meeting_provider?: string | null
          payment_reference?: string | null
          payment_status?: string
          policy_acknowledged_at?: string | null
          price_minor?: number
          public_reference?: string
          refund_status?: string | null
          request_expires_at?: string | null
          requested_start?: string | null
          reviewed_at?: string | null
          service_id?: string
          service_title_snapshot?: string | null
          session_status?: string
          slot?: string | null
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          category: string
          id: string
          published: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          id?: string
          published?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          id?: string
          published?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt_text: string
          caption: string
          created_at: string
          file_size: number
          id: string
          mime_type: string
          published: boolean
          storage_path: string
          updated_at: string
        }
        Insert: {
          alt_text?: string
          caption?: string
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          published?: boolean
          storage_path: string
          updated_at?: string
        }
        Update: {
          alt_text?: string
          caption?: string
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          published?: boolean
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      pages: {
        Row: {
          body: string
          content: Json
          id: string
          published: boolean
          seo_description: string
          seo_title: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          content?: Json
          id?: string
          published?: boolean
          seo_description?: string
          seo_title?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          content?: Json
          id?: string
          published?: boolean
          seo_description?: string
          seo_title?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          booking_id: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          paystack_reference: string
          processing_status: string
          verification_metadata: Json
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          paystack_reference: string
          processing_status?: string
          verification_metadata?: Json
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          paystack_reference?: string
          processing_status?: string
          verification_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_settings: {
        Row: {
          key: string
          published: boolean
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          published?: boolean
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          published?: boolean
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          attempts: number
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          audience: string | null
          created_at: string
          currency: string
          delivery_format: string | null
          description: string
          duration_minutes: number | null
          full_description: string
          id: string
          price_minor: number | null
          published: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string | null
          created_at?: string
          currency?: string
          delivery_format?: string | null
          description?: string
          duration_minutes?: number | null
          full_description?: string
          id?: string
          price_minor?: number | null
          published?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string | null
          created_at?: string
          currency?: string
          delivery_format?: string | null
          description?: string
          duration_minutes?: number | null
          full_description?: string
          id?: string
          price_minor?: number | null
          published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aviv_admin_booking_action: {
        Args: {
          _action: string
          _expected_updated_at: string
          _id: string
          _start?: string
        }
        Returns: undefined
      }
      aviv_admin_block_period: {
        Args: { _end: string; _reason: string; _start: string }
        Returns: string
      }
      aviv_admin_unblock_period: { Args: { _id: string }; Returns: undefined }
      aviv_booking_metrics: { Args: never; Returns: Json }
      aviv_consume_rate_limit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      aviv_create_guest_request: {
        Args: {
          _email: string
          _name: string
          _phone: string
          _service_slug: string
          _start: string
          _token_hash: string
        }
        Returns: Json
      }
      aviv_expire_stale_holds: { Args: never; Returns: number }
      aviv_rate_limit_exceeded: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      aviv_admin_confirmation_link: {
        Args: { _id: string; _session_hash: string }
        Returns: Json
      }
      aviv_admin_record_confirmation_email: {
        Args: { _id: string; _sent: boolean }
        Returns: undefined
      }
      aviv_admin_session_access: { Args: { _id: string }; Returns: Json }
      aviv_issue_session_link: {
        Args: { _client_key: string; _manage_hash: string; _session_hash: string }
        Returns: Json
      }
      aviv_read_guest_booking: {
        Args: { _client_key: string; _hash: string }
        Returns: Json
      }
      aviv_read_session_access: {
        Args: { _client_key: string; _hash: string }
        Returns: Json
      }
      aviv_reorder_content: {
        Args: { _direction: number; _id: string; _kind: string }
        Returns: undefined
      }
      aviv_slot_availability: {
        Args: { _from: string; _minutes: number; _to: string }
        Returns: {
          available: boolean
          reason: string | null
          slot_end: string
          slot_start: string
        }[]
      }
      aviv_slot_valid: {
        Args: { _minutes: number; _start: string }
        Returns: boolean
      }
      consume_contact_limit: { Args: { bucket: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
