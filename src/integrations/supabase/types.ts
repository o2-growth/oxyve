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
      _archive_org_70aa944f: {
        Row: {
          data: Json | null
          src: string | null
        }
        Insert: {
          data?: Json | null
          src?: string | null
        }
        Update: {
          data?: Json | null
          src?: string | null
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          daily_limit_cents: number | null
          department_id: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          requires_receipt: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_limit_cents?: number | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          requires_receipt?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_limit_cents?: number | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          requires_receipt?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_policies: {
        Row: {
          cycle_cutoff_day: number
          default_currency: string
          enforce_limits_mode: string
          id: string
          org_id: string
          require_cost_center: boolean
          require_project: boolean
          require_receipt: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          cycle_cutoff_day?: number
          default_currency?: string
          enforce_limits_mode?: string
          id?: string
          org_id: string
          require_cost_center?: boolean
          require_project?: boolean
          require_receipt?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          cycle_cutoff_day?: number
          default_currency?: string
          enforce_limits_mode?: string
          id?: string
          org_id?: string
          require_cost_center?: boolean
          require_project?: boolean
          require_receipt?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reviews: {
        Row: {
          comment: string | null
          created_at: string
          decision: string
          expense_id: string
          id: string
          report_id: string
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decision: string
          expense_id: string
          id?: string
          report_id: string
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decision?: string
          expense_id?: string
          id?: string
          report_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reviews_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reviews_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          currency: string | null
          date: string
          description: string
          id: string
          is_out_of_policy: boolean
          is_reimbursable: boolean
          notes: string | null
          org_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          project_id: string | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string | null
          date: string
          description: string
          id?: string
          is_out_of_policy?: boolean
          is_reimbursable?: boolean
          notes?: string | null
          org_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          project_id?: string | null
          receipt_path?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string | null
          date?: string
          description?: string
          id?: string
          is_out_of_policy?: boolean
          is_reimbursable?: boolean
          notes?: string | null
          org_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          project_id?: string | null
          receipt_path?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          emailed_at: string | null
          id: string
          link: string | null
          org_id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          emailed_at?: string | null
          id?: string
          link?: string | null
          org_id: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          emailed_at?: string | null
          id?: string
          link?: string | null
          org_id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          org_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_domains_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_name: string | null
          cpf_cnpj: string | null
          created_at: string
          currency: string | null
          department_id: string | null
          full_name: string | null
          id: string
          org_id: string | null
          pix_key: string | null
          pix_key_type: Database["public"]["Enums"]["pix_key_type"] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          currency?: string | null
          department_id?: string | null
          full_name?: string | null
          id: string
          org_id?: string | null
          pix_key?: string | null
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          currency?: string | null
          department_id?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          pix_key?: string | null
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_approvals: {
        Row: {
          approver_id: string | null
          comment: string | null
          decided_at: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          report_id: string
        }
        Insert: {
          approver_id?: string | null
          comment?: string | null
          decided_at?: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
          report_id: string
        }
        Update: {
          approver_id?: string | null
          comment?: string | null
          decided_at?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_approvals_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_events: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          event_type: string
          id: string
          report_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          report_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_items: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          report_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          report_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          cycle_key: string | null
          due_date: string | null
          end_date: string | null
          id: string
          org_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          submitted_late: boolean | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_key?: string | null
          due_date?: string | null
          end_date?: string | null
          id?: string
          org_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          submitted_late?: boolean | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_key?: string | null
          due_date?: string | null
          end_date?: string | null
          id?: string
          org_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          submitted_late?: boolean | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      admin_assign_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_decide_report: {
        Args: { p_comment?: string; p_decision: string; p_report_id: string }
        Returns: Json
      }
      bootstrap_user: { Args: { p_invite_token: string }; Returns: Json }
      create_expense_in_current_report: {
        Args: {
          p_amount_cents: number
          p_category_id?: string
          p_cost_center_id?: string
          p_currency?: string
          p_date: string
          p_description: string
          p_is_reimbursable?: boolean
          p_notes?: string
          p_payment_method?: string
          p_project_id?: string
          p_receipt_path?: string
        }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_body?: string
          p_category: string
          p_link?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      dispatch_pending_notification_emails: { Args: never; Returns: number }
      get_dashboard_context: { Args: never; Returns: Json }
      get_or_create_current_report: { Args: never; Returns: Json }
      get_or_create_report_for_date: { Args: { p_date: string }; Returns: Json }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_or_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_report_paid: { Args: { p_report_id: string }; Returns: Json }
      submit_report: { Args: { p_report_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "employee" | "manager" | "admin"
      approval_decision: "approved" | "rejected"
      expense_status: "draft" | "submitted" | "approved" | "rejected" | "paid"
      notification_category:
        | "action_required"
        | "my_expenses"
        | "reports"
        | "other"
      payment_method: "personal_card" | "corporate_card" | "cash" | "other"
      pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random"
      report_status: "draft" | "submitted" | "approved" | "rejected" | "paid"
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
      app_role: ["employee", "manager", "admin"],
      approval_decision: ["approved", "rejected"],
      expense_status: ["draft", "submitted", "approved", "rejected", "paid"],
      notification_category: [
        "action_required",
        "my_expenses",
        "reports",
        "other",
      ],
      payment_method: ["personal_card", "corporate_card", "cash", "other"],
      pix_key_type: ["cpf", "cnpj", "email", "phone", "random"],
      report_status: ["draft", "submitted", "approved", "rejected", "paid"],
    },
  },
} as const
