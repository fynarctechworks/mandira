export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      accessibility_records: {
        Row: {
          created_at: string
          distance_from_dropoff_m: number | null
          id: string
          notes_i18n: Json
          place_id: string | null
          queue_assistance: boolean | null
          rest_seating: boolean | null
          route_id: string | null
          step_free: string | null
          updated_at: string
          wheelchair_access: string | null
        }
        Insert: {
          created_at?: string
          distance_from_dropoff_m?: number | null
          id?: string
          notes_i18n?: Json
          place_id?: string | null
          queue_assistance?: boolean | null
          rest_seating?: boolean | null
          route_id?: string | null
          step_free?: string | null
          updated_at?: string
          wheelchair_access?: string | null
        }
        Update: {
          created_at?: string
          distance_from_dropoff_m?: number | null
          id?: string
          notes_i18n?: Json
          place_id?: string | null
          queue_assistance?: boolean | null
          rest_seating?: boolean | null
          route_id?: string | null
          step_free?: string | null
          updated_at?: string
          wheelchair_access?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accessibility_records_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessibility_records_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessibility_records_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: true
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessibility_records_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: true
            referencedRelation: "v_published_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      advisories: {
        Row: {
          body_i18n: Json
          created_at: string
          destination_id: string
          ends_at: string | null
          id: string
          published_at: string | null
          published_by: string | null
          severity: string
          source_id: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["publish_status_enum"]
          title_i18n: Json
          updated_at: string
        }
        Insert: {
          body_i18n?: Json
          created_at?: string
          destination_id: string
          ends_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          severity?: string
          source_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["publish_status_enum"]
          title_i18n?: Json
          updated_at?: string
        }
        Update: {
          body_i18n?: Json
          created_at?: string
          destination_id?: string
          ends_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          severity?: string
          source_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["publish_status_enum"]
          title_i18n?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisories_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisories_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisories_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cache: {
        Row: {
          created_at: string
          expires_at: string
          grounding_hash: string
          input_hash: string
          model: string
          output: Json
          provider: string
          task: Database["public"]["Enums"]["ai_task_enum"]
        }
        Insert: {
          created_at?: string
          expires_at?: string
          grounding_hash: string
          input_hash: string
          model: string
          output: Json
          provider: string
          task: Database["public"]["Enums"]["ai_task_enum"]
        }
        Update: {
          created_at?: string
          expires_at?: string
          grounding_hash?: string
          input_hash?: string
          model?: string
          output?: Json
          provider?: string
          task?: Database["public"]["Enums"]["ai_task_enum"]
        }
        Relationships: []
      }
      ai_calls: {
        Row: {
          created_at: string
          error_code: string | null
          grounding_hash: string | null
          id: string
          is_fallback: boolean
          latency_ms: number | null
          model: string
          ok: boolean
          provider: string
          task: Database["public"]["Enums"]["ai_task_enum"]
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          grounding_hash?: string | null
          id?: string
          is_fallback?: boolean
          latency_ms?: number | null
          model: string
          ok: boolean
          provider: string
          task: Database["public"]["Enums"]["ai_task_enum"]
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          grounding_hash?: string | null
          id?: string
          is_fallback?: boolean
          latency_ms?: number | null
          model?: string
          ok?: boolean
          provider?: string
          task?: Database["public"]["Enums"]["ai_task_enum"]
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      ai_extractions: {
        Row: {
          capture_id: string
          created_at: string
          id: string
          model: string
          proposed_entities: Json
          provider: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          capture_id: string
          created_at?: string
          id?: string
          model: string
          proposed_entities?: Json
          provider: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          capture_id?: string
          created_at?: string
          id?: string
          model?: string
          proposed_entities?: Json
          provider?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_extractions_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "source_captures"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          anon_session_id: string | null
          created_at: string
          destination_id: string | null
          event_name: string
          id: string
          is_offline: boolean
          journey_id: string | null
          locale: string | null
          properties: Json
        }
        Insert: {
          anon_session_id?: string | null
          created_at?: string
          destination_id?: string | null
          event_name: string
          id?: string
          is_offline?: boolean
          journey_id?: string | null
          locale?: string | null
          properties?: Json
        }
        Update: {
          anon_session_id?: string | null
          created_at?: string
          destination_id?: string | null
          event_name?: string
          id?: string
          is_offline?: boolean
          journey_id?: string | null
          locale?: string | null
          properties?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_table: string | null
          id: string
          ip_hash: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          ip_hash?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          ip_hash?: string | null
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          calendar_dates: string[] | null
          capacity_note_i18n: Json
          created_at: string
          daily_times: Json | null
          date_end: string | null
          date_start: string | null
          experience_id: string
          id: string
          kind: Database["public"]["Enums"]["availability_kind_enum"]
          priority: number
          season_label_i18n: Json
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          weekly_pattern: Json | null
        }
        Insert: {
          calendar_dates?: string[] | null
          capacity_note_i18n?: Json
          created_at?: string
          daily_times?: Json | null
          date_end?: string | null
          date_start?: string | null
          experience_id: string
          id?: string
          kind: Database["public"]["Enums"]["availability_kind_enum"]
          priority?: number
          season_label_i18n?: Json
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          weekly_pattern?: Json | null
        }
        Update: {
          calendar_dates?: string[] | null
          capacity_note_i18n?: Json
          created_at?: string
          daily_times?: Json | null
          date_end?: string | null
          date_start?: string | null
          experience_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["availability_kind_enum"]
          priority?: number
          season_label_i18n?: Json
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          weekly_pattern?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "v_published_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      change_candidates: {
        Row: {
          capture_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          entity_id: string | null
          entity_table: string
          excerpt: string | null
          field_name: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          source_id: string | null
          status: Database["public"]["Enums"]["task_status_enum"]
          updated_at: string
        }
        Insert: {
          capture_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          entity_id?: string | null
          entity_table: string
          excerpt?: string | null
          field_name?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["task_status_enum"]
          updated_at?: string
        }
        Update: {
          capture_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          entity_id?: string | null
          entity_table?: string
          excerpt?: string | null
          field_name?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["task_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_candidates_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "source_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_destinations: {
        Row: {
          circuit_id: string
          destination_id: string
          sort_order: number
        }
        Insert: {
          circuit_id: string
          destination_id: string
          sort_order?: number
        }
        Update: {
          circuit_id?: string
          destination_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "circuit_destinations_circuit_id_fkey"
            columns: ["circuit_id"]
            isOneToOne: false
            referencedRelation: "circuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      circuits: {
        Row: {
          created_at: string
          description_i18n: Json
          id: string
          name_i18n: Json
          slug: string
          status: Database["public"]["Enums"]["publish_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_i18n?: Json
          id?: string
          name_i18n?: Json
          slug: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_i18n?: Json
          id?: string
          name_i18n?: Json
          slug?: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      conflicts: {
        Row: {
          created_at: string
          entity_id: string
          entity_table: string
          field_name: string | null
          id: string
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          values: Json
          winner_source_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_table: string
          field_name?: string | null
          id?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          values?: Json
          winner_source_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_table?: string
          field_name?: string | null
          id?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          values?: Json
          winner_source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conflicts_winner_source_id_fkey"
            columns: ["winner_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_links: {
        Row: {
          destination_id: string
          nearby_destination_id: string
          note_i18n: Json
        }
        Insert: {
          destination_id: string
          nearby_destination_id: string
          note_i18n?: Json
        }
        Update: {
          destination_id?: string
          nearby_destination_id?: string
          note_i18n?: Json
        }
        Relationships: [
          {
            foreignKeyName: "destination_links_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_links_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_links_nearby_destination_id_fkey"
            columns: ["nearby_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_links_nearby_destination_id_fkey"
            columns: ["nearby_destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          best_seasons_i18n: Json
          centre: unknown
          country: string
          created_at: string
          deleted_at: string | null
          editorial_weight: number
          embedding: string | null
          hero_media_id: string | null
          id: string
          name_i18n: Json
          overview_i18n: Json
          published_at: string | null
          radius_km: number
          region: string | null
          search_tsv: unknown
          seasonal_notes_i18n: Json
          slug: string
          state: string | null
          status: Database["public"]["Enums"]["publish_status_enum"]
          updated_at: string
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          best_seasons_i18n?: Json
          centre?: unknown
          country?: string
          created_at?: string
          deleted_at?: string | null
          editorial_weight?: number
          embedding?: string | null
          hero_media_id?: string | null
          id?: string
          name_i18n?: Json
          overview_i18n?: Json
          published_at?: string | null
          radius_km?: number
          region?: string | null
          search_tsv?: unknown
          seasonal_notes_i18n?: Json
          slug: string
          state?: string | null
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Update: {
          best_seasons_i18n?: Json
          centre?: unknown
          country?: string
          created_at?: string
          deleted_at?: string | null
          editorial_weight?: number
          embedding?: string | null
          hero_media_id?: string | null
          id?: string
          name_i18n?: Json
          overview_i18n?: Json
          published_at?: string | null
          radius_km?: number
          region?: string | null
          search_tsv?: unknown
          seasonal_notes_i18n?: Json
          slug?: string
          state?: string | null
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinations_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_media: {
        Row: {
          entity_id: string
          entity_table: string
          media_id: string
          role: string
          sort_order: number
        }
        Insert: {
          entity_id: string
          entity_table: string
          media_id: string
          role: string
          sort_order?: number
        }
        Update: {
          entity_id?: string
          entity_table?: string
          media_id?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_versions: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          changed_fields: string[]
          created_at: string
          entity_id: string
          entity_table: string
          id: string
          snapshot: Json
          version: number
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          changed_fields?: string[]
          created_at?: string
          entity_id: string
          entity_table: string
          id?: string
          snapshot: Json
          version: number
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          changed_fields?: string[]
          created_at?: string
          entity_id?: string
          entity_table?: string
          id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: []
      }
      experiences: {
        Row: {
          advance_booking_how_i18n: Json
          advance_booking_opens_days_before: number | null
          advance_booking_required: boolean
          cost_note_i18n: Json
          created_at: string
          deleted_at: string | null
          description_i18n: Json
          destination_id: string
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          duration_min_minutes: number | null
          editorial_weight: number
          eligibility_i18n: Json
          embedding: string | null
          experience_type: Database["public"]["Enums"]["experience_type_enum"]
          id: string
          is_outdoor: boolean
          name_i18n: Json
          place_id: string | null
          preparation_i18n: Json
          published_at: string | null
          queue_expectation_i18n: Json
          route_id: string | null
          search_tsv: unknown
          significance_i18n: Json
          slug: string
          status: Database["public"]["Enums"]["publish_status_enum"]
          updated_at: string
        }
        Insert: {
          advance_booking_how_i18n?: Json
          advance_booking_opens_days_before?: number | null
          advance_booking_required?: boolean
          cost_note_i18n?: Json
          created_at?: string
          deleted_at?: string | null
          description_i18n?: Json
          destination_id: string
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          editorial_weight?: number
          eligibility_i18n?: Json
          embedding?: string | null
          experience_type: Database["public"]["Enums"]["experience_type_enum"]
          id?: string
          is_outdoor?: boolean
          name_i18n?: Json
          place_id?: string | null
          preparation_i18n?: Json
          published_at?: string | null
          queue_expectation_i18n?: Json
          route_id?: string | null
          search_tsv?: unknown
          significance_i18n?: Json
          slug: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Update: {
          advance_booking_how_i18n?: Json
          advance_booking_opens_days_before?: number | null
          advance_booking_required?: boolean
          cost_note_i18n?: Json
          created_at?: string
          deleted_at?: string | null
          description_i18n?: Json
          destination_id?: string
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          editorial_weight?: number
          eligibility_i18n?: Json
          embedding?: string | null
          experience_type?: Database["public"]["Enums"]["experience_type_enum"]
          id?: string
          is_outdoor?: boolean
          name_i18n?: Json
          place_id?: string | null
          preparation_i18n?: Json
          published_at?: string | null
          queue_expectation_i18n?: Json
          route_id?: string | null
          search_tsv?: unknown
          significance_i18n?: Json
          slug?: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_published_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          destination_ids: string[] | null
          is_enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          destination_ids?: string[] | null
          is_enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          destination_ids?: string[] | null
          is_enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      guidance_blocks: {
        Row: {
          applies_to_id: string
          applies_to_table: string
          body_i18n: Json
          created_at: string
          deleted_at: string | null
          guidance_type: Database["public"]["Enums"]["guidance_type_enum"]
          id: string
          published_at: string | null
          sort_order: number
          status: Database["public"]["Enums"]["publish_status_enum"]
          updated_at: string
        }
        Insert: {
          applies_to_id: string
          applies_to_table: string
          body_i18n?: Json
          created_at?: string
          deleted_at?: string | null
          guidance_type: Database["public"]["Enums"]["guidance_type_enum"]
          id?: string
          published_at?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Update: {
          applies_to_id?: string
          applies_to_table?: string
          body_i18n?: Json
          created_at?: string
          deleted_at?: string | null
          guidance_type?: Database["public"]["Enums"]["guidance_type_enum"]
          id?: string
          published_at?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          source_id: string
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          source_id: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          source_id?: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          detail: Json | null
          finished_at: string | null
          id: string
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          detail?: Json | null
          finished_at?: string | null
          id?: string
          job_name: string
          started_at?: string
          status?: string
        }
        Update: {
          detail?: Json | null
          finished_at?: string | null
          id?: string
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      journey_change_events: {
        Row: {
          applied_changes: Json | null
          change_card: Json | null
          chosen_option_index: number | null
          created_at: string
          decided_at: string | null
          id: string
          impact: Json | null
          journey_id: string
          trigger: Database["public"]["Enums"]["change_trigger_enum"]
          trigger_payload: Json | null
        }
        Insert: {
          applied_changes?: Json | null
          change_card?: Json | null
          chosen_option_index?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          impact?: Json | null
          journey_id: string
          trigger: Database["public"]["Enums"]["change_trigger_enum"]
          trigger_payload?: Json | null
        }
        Update: {
          applied_changes?: Json | null
          change_card?: Json | null
          chosen_option_index?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          impact?: Json | null
          journey_id?: string
          trigger?: Database["public"]["Enums"]["change_trigger_enum"]
          trigger_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_change_events_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_destinations: {
        Row: {
          destination_id: string
          journey_id: string
          sort_order: number
        }
        Insert: {
          destination_id: string
          journey_id: string
          sort_order?: number
        }
        Update: {
          destination_id?: string
          journey_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journey_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_destinations_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_item_dependencies: {
        Row: {
          after_item_id: string
          item_id: string
        }
        Insert: {
          after_item_id: string
          item_id: string
        }
        Update: {
          after_item_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_item_dependencies_after_item_id_fkey"
            columns: ["after_item_id"]
            isOneToOne: false
            referencedRelation: "journey_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_item_dependencies_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "journey_items"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_item_notes: {
        Row: {
          body: string | null
          created_at: string
          id: string
          item_id: string
          media_id: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          item_id: string
          media_id?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string
          media_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_item_notes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "journey_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_item_notes_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_items: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          buffer_minutes: number
          created_at: string
          day_index: number
          deleted_at: string | null
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          experience_id: string | null
          fixed_end_at: string | null
          fixed_start_at: string | null
          id: string
          item_type: Database["public"]["Enums"]["journey_item_type_enum"]
          journey_id: string
          note: string | null
          place_id: string | null
          planned_end_at: string | null
          planned_start_at: string | null
          preferred_window_end: string | null
          preferred_window_start: string | null
          prep_requirements: Json | null
          route_id: string | null
          sort_order: number
          status: string
          tier: Database["public"]["Enums"]["priority_tier_enum"]
          title_override: string | null
          transport_connection_id: string | null
          travel_from_item_id: string | null
          travel_mode: Database["public"]["Enums"]["travel_mode_enum"] | null
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          buffer_minutes?: number
          created_at?: string
          day_index?: number
          deleted_at?: string | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          experience_id?: string | null
          fixed_end_at?: string | null
          fixed_start_at?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["journey_item_type_enum"]
          journey_id: string
          note?: string | null
          place_id?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          preferred_window_end?: string | null
          preferred_window_start?: string | null
          prep_requirements?: Json | null
          route_id?: string | null
          sort_order?: number
          status?: string
          tier?: Database["public"]["Enums"]["priority_tier_enum"]
          title_override?: string | null
          transport_connection_id?: string | null
          travel_from_item_id?: string | null
          travel_mode?: Database["public"]["Enums"]["travel_mode_enum"] | null
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          buffer_minutes?: number
          created_at?: string
          day_index?: number
          deleted_at?: string | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          experience_id?: string | null
          fixed_end_at?: string | null
          fixed_start_at?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["journey_item_type_enum"]
          journey_id?: string
          note?: string | null
          place_id?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          preferred_window_end?: string | null
          preferred_window_start?: string | null
          prep_requirements?: Json | null
          route_id?: string | null
          sort_order?: number
          status?: string
          tier?: Database["public"]["Enums"]["priority_tier_enum"]
          title_override?: string | null
          transport_connection_id?: string | null
          travel_from_item_id?: string | null
          travel_mode?: Database["public"]["Enums"]["travel_mode_enum"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_items_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "v_published_experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_published_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_transport_connection_id_fkey"
            columns: ["transport_connection_id"]
            isOneToOne: false
            referencedRelation: "transport_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_transport_connection_id_fkey"
            columns: ["transport_connection_id"]
            isOneToOne: false
            referencedRelation: "v_published_transport_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_items_travel_from_item_id_fkey"
            columns: ["travel_from_item_id"]
            isOneToOne: false
            referencedRelation: "journey_items"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_records: {
        Row: {
          created_at: string
          id: string
          journey_id: string
          reflection_answers: Json | null
          summary: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          journey_id: string
          reflection_answers?: Json | null
          summary?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          journey_id?: string
          reflection_answers?: Json | null
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_records_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: true
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          journey_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          journey_id: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          journey_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_shares_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_travelers: {
        Row: {
          journey_id: string
          traveler_profile_id: string
        }
        Insert: {
          journey_id: string
          traveler_profile_id: string
        }
        Update: {
          journey_id?: string
          traveler_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_travelers_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_travelers_traveler_profile_id_fkey"
            columns: ["traveler_profile_id"]
            isOneToOne: false
            referencedRelation: "traveler_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys: {
        Row: {
          active_day_index: number | null
          brief: Json | null
          completed_at: string | null
          created_at: string
          day_end_time: string
          day_start_time: string
          deleted_at: string | null
          device_draft_id: string | null
          end_date: string | null
          health_report: Json | null
          health_state: Database["public"]["Enums"]["health_state_enum"] | null
          id: string
          knowledge_snapshot_at: string | null
          owner_user_id: string | null
          pace: Database["public"]["Enums"]["pace_enum"]
          start_date: string | null
          status: Database["public"]["Enums"]["journey_status_enum"]
          structure: string
          timezone: string
          title: string | null
          transport_preference: string | null
          updated_at: string
          walking_tolerance: string | null
        }
        Insert: {
          active_day_index?: number | null
          brief?: Json | null
          completed_at?: string | null
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          deleted_at?: string | null
          device_draft_id?: string | null
          end_date?: string | null
          health_report?: Json | null
          health_state?: Database["public"]["Enums"]["health_state_enum"] | null
          id?: string
          knowledge_snapshot_at?: string | null
          owner_user_id?: string | null
          pace?: Database["public"]["Enums"]["pace_enum"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["journey_status_enum"]
          structure?: string
          timezone?: string
          title?: string | null
          transport_preference?: string | null
          updated_at?: string
          walking_tolerance?: string | null
        }
        Update: {
          active_day_index?: number | null
          brief?: Json | null
          completed_at?: string | null
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          deleted_at?: string | null
          device_draft_id?: string | null
          end_date?: string | null
          health_report?: Json | null
          health_state?: Database["public"]["Enums"]["health_state_enum"] | null
          id?: string
          knowledge_snapshot_at?: string | null
          owner_user_id?: string | null
          pace?: Database["public"]["Enums"]["pace_enum"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["journey_status_enum"]
          structure?: string
          timezone?: string
          title?: string | null
          transport_preference?: string | null
          updated_at?: string
          walking_tolerance?: string | null
        }
        Relationships: []
      }
      live_feed_configs: {
        Row: {
          config: Json
          created_at: string
          destination_id: string
          feed_kind: string
          id: string
          is_enabled: boolean
          provider: string
          refresh_minutes: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          destination_id: string
          feed_kind: string
          id?: string
          is_enabled?: boolean
          provider: string
          refresh_minutes?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          destination_id?: string
          feed_kind?: string
          id?: string
          is_enabled?: boolean
          provider?: string
          refresh_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_feed_configs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_configs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_feed_readings: {
        Row: {
          affects_entity_ids: string[]
          created_at: string
          feed_config_id: string
          id: string
          payload: Json
          read_at: string
          status: string
        }
        Insert: {
          affects_entity_ids?: string[]
          created_at?: string
          feed_config_id: string
          id?: string
          payload?: Json
          read_at?: string
          status: string
        }
        Update: {
          affects_entity_ids?: string[]
          created_at?: string
          feed_config_id?: string
          id?: string
          payload?: Json
          read_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_feed_readings_feed_config_id_fkey"
            columns: ["feed_config_id"]
            isOneToOne: false
            referencedRelation: "live_feed_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_readings_feed_config_id_fkey"
            columns: ["feed_config_id"]
            isOneToOne: false
            referencedRelation: "v_published_live_conditions"
            referencedColumns: ["feed_config_id"]
          },
        ]
      }
      locales: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name_en: string
          name_native: string
          script: string
          sort_order: number
          transliteration_scheme: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name_en: string
          name_native: string
          script: string
          sort_order?: number
          transliteration_scheme?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name_en?: string
          name_native?: string
          script?: string
          sort_order?: number
          transliteration_scheme?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          caption_i18n: Json
          created_at: string
          credit: string | null
          deleted_at: string | null
          height: number | null
          id: string
          licence: string | null
          media_type: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          caption_i18n?: Json
          created_at?: string
          credit?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string
          licence?: string | null
          media_type: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          caption_i18n?: Json
          created_at?: string
          credit?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string
          licence?: string | null
          media_type?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      notification_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          keys: Json
          last_success_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          keys: Json
          last_success_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          keys?: Json
          last_success_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body_i18n: Json
          channel: string
          created_at: string
          id: string
          journey_id: string | null
          notification_type: Database["public"]["Enums"]["notification_type_enum"]
          payload: Json | null
          read_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          title_i18n: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          body_i18n?: Json
          channel: string
          created_at?: string
          id?: string
          journey_id?: string | null
          notification_type: Database["public"]["Enums"]["notification_type_enum"]
          payload?: Json | null
          read_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          title_i18n?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          body_i18n?: Json
          channel?: string
          created_at?: string
          id?: string
          journey_id?: string | null
          notification_type?: Database["public"]["Enums"]["notification_type_enum"]
          payload?: Json | null
          read_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          title_i18n?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      personalization_signals: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_table: string | null
          id: string
          journey_id: string | null
          signal_type: string
          user_id: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          journey_id?: string | null
          signal_type: string
          user_id: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          journey_id?: string | null
          signal_type?: string
          user_id?: string
          value?: Json | null
        }
        Relationships: []
      }
      phrases: {
        Row: {
          audio_media_id: string | null
          context_tag: string
          created_at: string
          destination_id: string | null
          id: string
          published_at: string | null
          sort_order: number
          source_locale: string
          source_text: string
          status: Database["public"]["Enums"]["publish_status_enum"]
          translations: Json
          updated_at: string
        }
        Insert: {
          audio_media_id?: string | null
          context_tag: string
          created_at?: string
          destination_id?: string | null
          id?: string
          published_at?: string | null
          sort_order?: number
          source_locale: string
          source_text: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          translations?: Json
          updated_at?: string
        }
        Update: {
          audio_media_id?: string | null
          context_tag?: string
          created_at?: string
          destination_id?: string | null
          id?: string
          published_at?: string | null
          sort_order?: number
          source_locale?: string
          source_text?: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          translations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phrases_audio_media_id_fkey"
            columns: ["audio_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrases_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrases_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrases_source_locale_fkey"
            columns: ["source_locale"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["code"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          closure_rules_i18n: Json
          created_at: string
          crowd_pattern: Json | null
          deleted_at: string | null
          destination_id: string
          dress_code_i18n: Json
          editorial_weight: number
          embedding: string | null
          entry_requirements_i18n: Json
          facility_subtype:
            | Database["public"]["Enums"]["facility_subtype_enum"]
            | null
          hours_note_i18n: Json
          id: string
          location: unknown
          name_i18n: Json
          opening_schedule: Json | null
          place_type: Database["public"]["Enums"]["place_type_enum"]
          published_at: string | null
          search_tsv: unknown
          slug: string
          status: Database["public"]["Enums"]["publish_status_enum"]
          summary_i18n: Json
          updated_at: string
          visit_duration_likely_minutes: number | null
          visit_duration_max_minutes: number | null
          visit_duration_min_minutes: number | null
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          address?: string | null
          closure_rules_i18n?: Json
          created_at?: string
          crowd_pattern?: Json | null
          deleted_at?: string | null
          destination_id: string
          dress_code_i18n?: Json
          editorial_weight?: number
          embedding?: string | null
          entry_requirements_i18n?: Json
          facility_subtype?:
            | Database["public"]["Enums"]["facility_subtype_enum"]
            | null
          hours_note_i18n?: Json
          id?: string
          location?: unknown
          name_i18n?: Json
          opening_schedule?: Json | null
          place_type: Database["public"]["Enums"]["place_type_enum"]
          published_at?: string | null
          search_tsv?: unknown
          slug: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          summary_i18n?: Json
          updated_at?: string
          visit_duration_likely_minutes?: number | null
          visit_duration_max_minutes?: number | null
          visit_duration_min_minutes?: number | null
        }
        Update: {
          address?: string | null
          closure_rules_i18n?: Json
          created_at?: string
          crowd_pattern?: Json | null
          deleted_at?: string | null
          destination_id?: string
          dress_code_i18n?: Json
          editorial_weight?: number
          embedding?: string | null
          entry_requirements_i18n?: Json
          facility_subtype?:
            | Database["public"]["Enums"]["facility_subtype_enum"]
            | null
          hours_note_i18n?: Json
          id?: string
          location?: unknown
          name_i18n?: Json
          opening_schedule?: Json | null
          place_type?: Database["public"]["Enums"]["place_type_enum"]
          published_at?: string | null
          search_tsv?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          summary_i18n?: Json
          updated_at?: string
          visit_duration_likely_minutes?: number | null
          visit_duration_max_minutes?: number | null
          visit_duration_min_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "places_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      prepare_tasks: {
        Row: {
          body_i18n: Json
          created_at: string
          done_at: string | null
          due_at: string | null
          engine_key: string | null
          group_name: string
          id: string
          is_done: boolean
          journey_id: string
          sort_order: number
          source_item_id: string | null
          title_i18n: Json
          trust_ref: Json | null
          updated_at: string
        }
        Insert: {
          body_i18n?: Json
          created_at?: string
          done_at?: string | null
          due_at?: string | null
          engine_key?: string | null
          group_name: string
          id?: string
          is_done?: boolean
          journey_id: string
          sort_order?: number
          source_item_id?: string | null
          title_i18n?: Json
          trust_ref?: Json | null
          updated_at?: string
        }
        Update: {
          body_i18n?: Json
          created_at?: string
          done_at?: string | null
          due_at?: string | null
          engine_key?: string | null
          group_name?: string
          id?: string
          is_done?: boolean
          journey_id?: string
          sort_order?: number
          source_item_id?: string | null
          title_i18n?: Json
          trust_ref?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prepare_tasks_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepare_tasks_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "journey_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          id: string
          locale: string
          notification_prefs: Json
          onboarding_completed: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id: string
          locale?: string
          notification_prefs?: Json
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          locale?: string
          notification_prefs?: Json
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["code"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          scope: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          scope: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          scope?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      review_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_at: string | null
          entity_id: string | null
          entity_table: string | null
          field_name: string | null
          id: string
          notes: string | null
          priority: number
          related_id: string | null
          status: Database["public"]["Enums"]["task_status_enum"]
          task_type: Database["public"]["Enums"]["review_task_type_enum"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          field_name?: string | null
          id?: string
          notes?: string | null
          priority?: number
          related_id?: string | null
          status?: Database["public"]["Enums"]["task_status_enum"]
          task_type: Database["public"]["Enums"]["review_task_type_enum"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          field_name?: string | null
          id?: string
          notes?: string | null
          priority?: number
          related_id?: string | null
          status?: Database["public"]["Enums"]["task_status_enum"]
          task_type?: Database["public"]["Enums"]["review_task_type_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      route_places: {
        Row: {
          is_rest_point: boolean
          place_id: string
          route_id: string
          sort_order: number
        }
        Insert: {
          is_rest_point?: boolean
          place_id: string
          route_id: string
          sort_order?: number
        }
        Update: {
          is_rest_point?: boolean
          place_id?: string
          route_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_places_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_places_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_published_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          deleted_at: string | null
          destination_id: string
          difficulty: Database["public"]["Enums"]["difficulty_enum"] | null
          distance_m: number | null
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          duration_min_minutes: number | null
          elevation_note_i18n: Json
          geometry: Json | null
          id: string
          mode: Database["public"]["Enums"]["travel_mode_enum"]
          name_i18n: Json
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["publish_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          destination_id: string
          difficulty?: Database["public"]["Enums"]["difficulty_enum"] | null
          distance_m?: number | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          elevation_note_i18n?: Json
          geometry?: Json | null
          id?: string
          mode: Database["public"]["Enums"]["travel_mode_enum"]
          name_i18n?: Json
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string
          difficulty?: Database["public"]["Enums"]["difficulty_enum"] | null
          distance_m?: number | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          elevation_note_i18n?: Json
          geometry?: Json | null
          id?: string
          mode?: Database["public"]["Enums"]["travel_mode_enum"]
          name_i18n?: Json
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["publish_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_places: {
        Row: {
          created_at: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
        ]
      }
      source_captures: {
        Row: {
          captured_at: string
          content_hash: string | null
          created_at: string
          diff_from_previous: string | null
          id: string
          ingestion_job_id: string | null
          source_id: string
          storage_path: string | null
        }
        Insert: {
          captured_at?: string
          content_hash?: string | null
          created_at?: string
          diff_from_previous?: string | null
          id?: string
          ingestion_job_id?: string | null
          source_id: string
          storage_path?: string | null
        }
        Update: {
          captured_at?: string
          content_hash?: string | null
          created_at?: string
          diff_from_previous?: string | null
          id?: string
          ingestion_job_id?: string | null
          source_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_captures_ingestion_job_id_fkey"
            columns: ["ingestion_job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_captures_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          contact: string | null
          coverage: Json
          created_at: string
          id: string
          ingestion_method: string
          name: string
          notes: string | null
          owner_user_id: string | null
          refresh_cadence_days: number | null
          source_type: string
          status: string
          tier: Database["public"]["Enums"]["source_tier_enum"]
          updated_at: string
          url: string | null
        }
        Insert: {
          contact?: string | null
          coverage?: Json
          created_at?: string
          id?: string
          ingestion_method?: string
          name: string
          notes?: string | null
          owner_user_id?: string | null
          refresh_cadence_days?: number | null
          source_type: string
          status?: string
          tier: Database["public"]["Enums"]["source_tier_enum"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          contact?: string | null
          coverage?: Json
          created_at?: string
          id?: string
          ingestion_method?: string
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          refresh_cadence_days?: number | null
          source_type?: string
          status?: string
          tier?: Database["public"]["Enums"]["source_tier_enum"]
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      transport_connections: {
        Row: {
          booking_note_i18n: Json
          created_at: string
          destination_id: string
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          frequency_note_i18n: Json
          from_destination_id: string | null
          from_place_id: string | null
          id: string
          mode: Database["public"]["Enums"]["travel_mode_enum"]
          operator: string | null
          published_at: string | null
          seasonal_note_i18n: Json
          status: Database["public"]["Enums"]["publish_status_enum"]
          to_destination_id: string | null
          to_place_id: string | null
          updated_at: string
        }
        Insert: {
          booking_note_i18n?: Json
          created_at?: string
          destination_id: string
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          frequency_note_i18n?: Json
          from_destination_id?: string | null
          from_place_id?: string | null
          id?: string
          mode: Database["public"]["Enums"]["travel_mode_enum"]
          operator?: string | null
          published_at?: string | null
          seasonal_note_i18n?: Json
          status?: Database["public"]["Enums"]["publish_status_enum"]
          to_destination_id?: string | null
          to_place_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_note_i18n?: Json
          created_at?: string
          destination_id?: string
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          frequency_note_i18n?: Json
          from_destination_id?: string | null
          from_place_id?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["travel_mode_enum"]
          operator?: string | null
          published_at?: string | null
          seasonal_note_i18n?: Json
          status?: Database["public"]["Enums"]["publish_status_enum"]
          to_destination_id?: string | null
          to_place_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_connections_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_destination_id_fkey"
            columns: ["from_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_destination_id_fkey"
            columns: ["from_destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_destination_id_fkey"
            columns: ["to_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_destination_id_fkey"
            columns: ["to_destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_place_id_fkey"
            columns: ["to_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_place_id_fkey"
            columns: ["to_place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_estimates: {
        Row: {
          computed_at: string
          distance_m: number | null
          duration_seconds: number | null
          from_place_id: string
          mode: Database["public"]["Enums"]["travel_mode_enum"]
          provider: string | null
          to_place_id: string
        }
        Insert: {
          computed_at?: string
          distance_m?: number | null
          duration_seconds?: number | null
          from_place_id: string
          mode: Database["public"]["Enums"]["travel_mode_enum"]
          provider?: string | null
          to_place_id: string
        }
        Update: {
          computed_at?: string
          distance_m?: number | null
          duration_seconds?: number | null
          from_place_id?: string
          mode?: Database["public"]["Enums"]["travel_mode_enum"]
          provider?: string | null
          to_place_id?: string
        }
        Relationships: []
      }
      traveler_profiles: {
        Row: {
          age_band: Database["public"]["Enums"]["age_band_enum"]
          created_at: string
          deleted_at: string | null
          dietary_tags: string[]
          id: string
          is_self: boolean
          label: string | null
          locale: string | null
          mobility: Database["public"]["Enums"]["mobility_enum"]
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          age_band?: Database["public"]["Enums"]["age_band_enum"]
          created_at?: string
          deleted_at?: string | null
          dietary_tags?: string[]
          id?: string
          is_self?: boolean
          label?: string | null
          locale?: string | null
          mobility?: Database["public"]["Enums"]["mobility_enum"]
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          age_band?: Database["public"]["Enums"]["age_band_enum"]
          created_at?: string
          deleted_at?: string | null
          dietary_tags?: string[]
          id?: string
          is_self?: boolean
          label?: string | null
          locale?: string | null
          mobility?: Database["public"]["Enums"]["mobility_enum"]
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "traveler_profiles_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["code"]
          },
        ]
      }
      trust_records: {
        Row: {
          ai_generated: boolean
          confidence: Database["public"]["Enums"]["confidence_enum"]
          conflict_flag: boolean
          created_at: string
          entity_id: string
          entity_table: string
          evidence_excerpt: string | null
          evidence_url: string | null
          field_name: string | null
          freshness: Database["public"]["Enums"]["freshness_enum"]
          id: string
          report_downgrade: boolean
          source_id: string | null
          source_tier: Database["public"]["Enums"]["source_tier_enum"] | null
          updated_at: string
          valid_until: string | null
          verification_status: Database["public"]["Enums"]["verification_status_enum"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_generated?: boolean
          confidence?: Database["public"]["Enums"]["confidence_enum"]
          conflict_flag?: boolean
          created_at?: string
          entity_id: string
          entity_table: string
          evidence_excerpt?: string | null
          evidence_url?: string | null
          field_name?: string | null
          freshness?: Database["public"]["Enums"]["freshness_enum"]
          id?: string
          report_downgrade?: boolean
          source_id?: string | null
          source_tier?: Database["public"]["Enums"]["source_tier_enum"] | null
          updated_at?: string
          valid_until?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status_enum"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_generated?: boolean
          confidence?: Database["public"]["Enums"]["confidence_enum"]
          conflict_flag?: boolean
          created_at?: string
          entity_id?: string
          entity_table?: string
          evidence_excerpt?: string | null
          evidence_url?: string | null
          field_name?: string | null
          freshness?: Database["public"]["Enums"]["freshness_enum"]
          id?: string
          report_downgrade?: boolean
          source_id?: string | null
          source_tier?: Database["public"]["Enums"]["source_tier_enum"] | null
          updated_at?: string
          valid_until?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status_enum"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trust_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_strings: {
        Row: {
          created_at: string
          key: string
          locale: string
          status: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          locale: string
          status?: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          locale?: string
          status?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "ui_strings_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["code"]
          },
        ]
      }
      user_reports: {
        Row: {
          client_created_at: string | null
          created_at: string
          description: string | null
          entity_id: string
          entity_table: string
          field_name: string | null
          id: string
          journey_id: string | null
          locale: string | null
          media_id: string | null
          notified_user: boolean
          report_type: Database["public"]["Enums"]["report_type_enum"]
          reporter_hash: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status_enum"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_created_at?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          entity_table: string
          field_name?: string | null
          id?: string
          journey_id?: string | null
          locale?: string | null
          media_id?: string | null
          notified_user?: boolean
          report_type: Database["public"]["Enums"]["report_type_enum"]
          reporter_hash?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status_enum"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_created_at?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_table?: string
          field_name?: string | null
          id?: string
          journey_id?: string | null
          locale?: string | null
          media_id?: string | null
          notified_user?: boolean
          report_type?: Database["public"]["Enums"]["report_type_enum"]
          reporter_hash?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status_enum"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_reports_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["ops_role_enum"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["ops_role_enum"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["ops_role_enum"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null
          fk_constraint_name: unknown
          fk_schema_name: unknown
          fk_table_name: unknown
          fk_table_oid: unknown
          is_deferrable: boolean | null
          is_deferred: boolean | null
          match_type: string | null
          on_delete: string | null
          on_update: string | null
          pk_columns: unknown[] | null
          pk_constraint_name: unknown
          pk_index_name: unknown
          pk_schema_name: unknown
          pk_table_name: unknown
          pk_table_oid: unknown
        }
        Relationships: []
      }
      tap_funky: {
        Row: {
          args: string | null
          is_definer: boolean | null
          is_strict: boolean | null
          is_visible: boolean | null
          kind: unknown
          langoid: unknown
          name: unknown
          oid: unknown
          owner: unknown
          returns: string | null
          returns_set: boolean | null
          schema: unknown
          volatility: string | null
        }
        Relationships: []
      }
      v_job_health: {
        Row: {
          interval_seconds: number | null
          job_name: string | null
          last_run_at: string | null
          last_status: string | null
          missed_two_windows: boolean | null
          needs_attention: boolean | null
        }
        Relationships: []
      }
      v_published_advisories: {
        Row: {
          body_i18n: Json | null
          destination_id: string | null
          ends_at: string | null
          id: string | null
          published_at: string | null
          severity: string | null
          starts_at: string | null
          title_i18n: Json | null
          trust: Json | null
        }
        Insert: {
          body_i18n?: Json | null
          destination_id?: string | null
          ends_at?: string | null
          id?: string | null
          published_at?: string | null
          severity?: string | null
          starts_at?: string | null
          title_i18n?: Json | null
          trust?: never
        }
        Update: {
          body_i18n?: Json | null
          destination_id?: string | null
          ends_at?: string | null
          id?: string | null
          published_at?: string | null
          severity?: string | null
          starts_at?: string | null
          title_i18n?: Json | null
          trust?: never
        }
        Relationships: [
          {
            foreignKeyName: "advisories_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisories_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_availability_rules: {
        Row: {
          calendar_dates: string[] | null
          capacity_note_i18n: Json | null
          daily_times: Json | null
          date_end: string | null
          date_start: string | null
          experience_id: string | null
          id: string | null
          kind: Database["public"]["Enums"]["availability_kind_enum"] | null
          priority: number | null
          season_label_i18n: Json | null
          trust: Json | null
          valid_from: string | null
          valid_to: string | null
          weekly_pattern: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "v_published_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_destinations: {
        Row: {
          best_seasons_i18n: Json | null
          centre: unknown
          country: string | null
          editorial_weight: number | null
          hero_media_id: string | null
          id: string | null
          name_i18n: Json | null
          overview_i18n: Json | null
          published_at: string | null
          radius_km: number | null
          region: string | null
          search_tsv: unknown
          seasonal_notes_i18n: Json | null
          slug: string | null
          state: string | null
          trust: Json | null
        }
        Insert: {
          best_seasons_i18n?: Json | null
          centre?: unknown
          country?: string | null
          editorial_weight?: number | null
          hero_media_id?: string | null
          id?: string | null
          name_i18n?: Json | null
          overview_i18n?: Json | null
          published_at?: string | null
          radius_km?: number | null
          region?: string | null
          search_tsv?: unknown
          seasonal_notes_i18n?: Json | null
          slug?: string | null
          state?: string | null
          trust?: never
        }
        Update: {
          best_seasons_i18n?: Json | null
          centre?: unknown
          country?: string | null
          editorial_weight?: number | null
          hero_media_id?: string | null
          id?: string | null
          name_i18n?: Json | null
          overview_i18n?: Json | null
          published_at?: string | null
          radius_km?: number | null
          region?: string | null
          search_tsv?: unknown
          seasonal_notes_i18n?: Json | null
          slug?: string | null
          state?: string | null
          trust?: never
        }
        Relationships: [
          {
            foreignKeyName: "destinations_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_experiences: {
        Row: {
          accessibility: Json | null
          advance_booking_how_i18n: Json | null
          advance_booking_opens_days_before: number | null
          advance_booking_required: boolean | null
          cost_note_i18n: Json | null
          description_i18n: Json | null
          destination_id: string | null
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          duration_min_minutes: number | null
          editorial_weight: number | null
          eligibility_i18n: Json | null
          experience_type:
            | Database["public"]["Enums"]["experience_type_enum"]
            | null
          id: string | null
          is_outdoor: boolean | null
          name_i18n: Json | null
          place_id: string | null
          preparation_i18n: Json | null
          published_at: string | null
          queue_expectation_i18n: Json | null
          route_id: string | null
          search_tsv: unknown
          significance_i18n: Json | null
          slug: string | null
          trust: Json | null
        }
        Insert: {
          accessibility?: never
          advance_booking_how_i18n?: Json | null
          advance_booking_opens_days_before?: number | null
          advance_booking_required?: boolean | null
          cost_note_i18n?: Json | null
          description_i18n?: Json | null
          destination_id?: string | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          editorial_weight?: number | null
          eligibility_i18n?: Json | null
          experience_type?:
            | Database["public"]["Enums"]["experience_type_enum"]
            | null
          id?: string | null
          is_outdoor?: boolean | null
          name_i18n?: Json | null
          place_id?: string | null
          preparation_i18n?: Json | null
          published_at?: string | null
          queue_expectation_i18n?: Json | null
          route_id?: string | null
          search_tsv?: unknown
          significance_i18n?: Json | null
          slug?: string | null
          trust?: never
        }
        Update: {
          accessibility?: never
          advance_booking_how_i18n?: Json | null
          advance_booking_opens_days_before?: number | null
          advance_booking_required?: boolean | null
          cost_note_i18n?: Json | null
          description_i18n?: Json | null
          destination_id?: string | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          editorial_weight?: number | null
          eligibility_i18n?: Json | null
          experience_type?:
            | Database["public"]["Enums"]["experience_type_enum"]
            | null
          id?: string | null
          is_outdoor?: boolean | null
          name_i18n?: Json | null
          place_id?: string | null
          preparation_i18n?: Json | null
          published_at?: string | null
          queue_expectation_i18n?: Json | null
          route_id?: string | null
          search_tsv?: unknown
          significance_i18n?: Json | null
          slug?: string | null
          trust?: never
        }
        Relationships: [
          {
            foreignKeyName: "experiences_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_published_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_guidance_blocks: {
        Row: {
          applies_to_id: string | null
          applies_to_table: string | null
          body_i18n: Json | null
          guidance_type:
            | Database["public"]["Enums"]["guidance_type_enum"]
            | null
          id: string | null
          published_at: string | null
          sort_order: number | null
          trust: Json | null
        }
        Insert: {
          applies_to_id?: string | null
          applies_to_table?: string | null
          body_i18n?: Json | null
          guidance_type?:
            | Database["public"]["Enums"]["guidance_type_enum"]
            | null
          id?: string | null
          published_at?: string | null
          sort_order?: number | null
          trust?: never
        }
        Update: {
          applies_to_id?: string | null
          applies_to_table?: string | null
          body_i18n?: Json | null
          guidance_type?:
            | Database["public"]["Enums"]["guidance_type_enum"]
            | null
          id?: string | null
          published_at?: string | null
          sort_order?: number | null
          trust?: never
        }
        Relationships: []
      }
      v_published_live_conditions: {
        Row: {
          affects_entity_ids: string[] | null
          destination_id: string | null
          feed_config_id: string | null
          feed_kind: string | null
          is_stale: boolean | null
          payload: Json | null
          provider: string | null
          read_at: string | null
          reading_id: string | null
          refresh_minutes: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_feed_configs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_configs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_phrases: {
        Row: {
          audio_media_id: string | null
          context_tag: string | null
          destination_id: string | null
          id: string | null
          published_at: string | null
          sort_order: number | null
          source_locale: string | null
          source_text: string | null
          translations: Json | null
          trust: Json | null
        }
        Insert: {
          audio_media_id?: string | null
          context_tag?: string | null
          destination_id?: string | null
          id?: string | null
          published_at?: string | null
          sort_order?: number | null
          source_locale?: string | null
          source_text?: string | null
          translations?: Json | null
          trust?: never
        }
        Update: {
          audio_media_id?: string | null
          context_tag?: string | null
          destination_id?: string | null
          id?: string | null
          published_at?: string | null
          sort_order?: number | null
          source_locale?: string | null
          source_text?: string | null
          translations?: Json | null
          trust?: never
        }
        Relationships: [
          {
            foreignKeyName: "phrases_audio_media_id_fkey"
            columns: ["audio_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrases_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrases_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrases_source_locale_fkey"
            columns: ["source_locale"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["code"]
          },
        ]
      }
      v_published_places: {
        Row: {
          accessibility: Json | null
          address: string | null
          closure_rules_i18n: Json | null
          crowd_pattern: Json | null
          destination_id: string | null
          dress_code_i18n: Json | null
          editorial_weight: number | null
          entry_requirements_i18n: Json | null
          facility_subtype:
            | Database["public"]["Enums"]["facility_subtype_enum"]
            | null
          hours_note_i18n: Json | null
          id: string | null
          latitude: number | null
          location: unknown
          longitude: number | null
          name_i18n: Json | null
          opening_schedule: Json | null
          place_type: Database["public"]["Enums"]["place_type_enum"] | null
          published_at: string | null
          search_tsv: unknown
          slug: string | null
          summary_i18n: Json | null
          trust: Json | null
          visit_duration_likely_minutes: number | null
          visit_duration_max_minutes: number | null
          visit_duration_min_minutes: number | null
        }
        Insert: {
          accessibility?: never
          address?: string | null
          closure_rules_i18n?: Json | null
          crowd_pattern?: Json | null
          destination_id?: string | null
          dress_code_i18n?: Json | null
          editorial_weight?: number | null
          entry_requirements_i18n?: Json | null
          facility_subtype?:
            | Database["public"]["Enums"]["facility_subtype_enum"]
            | null
          hours_note_i18n?: Json | null
          id?: string | null
          latitude?: never
          location?: unknown
          longitude?: never
          name_i18n?: Json | null
          opening_schedule?: Json | null
          place_type?: Database["public"]["Enums"]["place_type_enum"] | null
          published_at?: string | null
          search_tsv?: unknown
          slug?: string | null
          summary_i18n?: Json | null
          trust?: never
          visit_duration_likely_minutes?: number | null
          visit_duration_max_minutes?: number | null
          visit_duration_min_minutes?: number | null
        }
        Update: {
          accessibility?: never
          address?: string | null
          closure_rules_i18n?: Json | null
          crowd_pattern?: Json | null
          destination_id?: string | null
          dress_code_i18n?: Json | null
          editorial_weight?: number | null
          entry_requirements_i18n?: Json | null
          facility_subtype?:
            | Database["public"]["Enums"]["facility_subtype_enum"]
            | null
          hours_note_i18n?: Json | null
          id?: string | null
          latitude?: never
          location?: unknown
          longitude?: never
          name_i18n?: Json | null
          opening_schedule?: Json | null
          place_type?: Database["public"]["Enums"]["place_type_enum"] | null
          published_at?: string | null
          search_tsv?: unknown
          slug?: string | null
          summary_i18n?: Json | null
          trust?: never
          visit_duration_likely_minutes?: number | null
          visit_duration_max_minutes?: number | null
          visit_duration_min_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "places_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_routes: {
        Row: {
          accessibility: Json | null
          destination_id: string | null
          difficulty: Database["public"]["Enums"]["difficulty_enum"] | null
          distance_m: number | null
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          duration_min_minutes: number | null
          elevation_note_i18n: Json | null
          geometry: Json | null
          id: string | null
          mode: Database["public"]["Enums"]["travel_mode_enum"] | null
          name_i18n: Json | null
          published_at: string | null
          slug: string | null
          stops: Json | null
          trust: Json | null
        }
        Insert: {
          accessibility?: never
          destination_id?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_enum"] | null
          distance_m?: number | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          elevation_note_i18n?: Json | null
          geometry?: Json | null
          id?: string | null
          mode?: Database["public"]["Enums"]["travel_mode_enum"] | null
          name_i18n?: Json | null
          published_at?: string | null
          slug?: string | null
          stops?: never
          trust?: never
        }
        Update: {
          accessibility?: never
          destination_id?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_enum"] | null
          distance_m?: number | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          duration_min_minutes?: number | null
          elevation_note_i18n?: Json | null
          geometry?: Json | null
          id?: string | null
          mode?: Database["public"]["Enums"]["travel_mode_enum"] | null
          name_i18n?: Json | null
          published_at?: string | null
          slug?: string | null
          stops?: never
          trust?: never
        }
        Relationships: [
          {
            foreignKeyName: "routes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_transport_connections: {
        Row: {
          booking_note_i18n: Json | null
          destination_id: string | null
          duration_likely_minutes: number | null
          duration_max_minutes: number | null
          frequency_note_i18n: Json | null
          from_destination_id: string | null
          from_place_id: string | null
          id: string | null
          mode: Database["public"]["Enums"]["travel_mode_enum"] | null
          operator: string | null
          published_at: string | null
          seasonal_note_i18n: Json | null
          to_destination_id: string | null
          to_place_id: string | null
          trust: Json | null
        }
        Insert: {
          booking_note_i18n?: Json | null
          destination_id?: string | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          frequency_note_i18n?: Json | null
          from_destination_id?: string | null
          from_place_id?: string | null
          id?: string | null
          mode?: Database["public"]["Enums"]["travel_mode_enum"] | null
          operator?: string | null
          published_at?: string | null
          seasonal_note_i18n?: Json | null
          to_destination_id?: string | null
          to_place_id?: string | null
          trust?: never
        }
        Update: {
          booking_note_i18n?: Json | null
          destination_id?: string | null
          duration_likely_minutes?: number | null
          duration_max_minutes?: number | null
          frequency_note_i18n?: Json | null
          from_destination_id?: string | null
          from_place_id?: string | null
          id?: string | null
          mode?: Database["public"]["Enums"]["travel_mode_enum"] | null
          operator?: string | null
          published_at?: string | null
          seasonal_note_i18n?: Json | null
          to_destination_id?: string | null
          to_place_id?: string | null
          trust?: never
        }
        Relationships: [
          {
            foreignKeyName: "transport_connections_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_destination_id_fkey"
            columns: ["from_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_destination_id_fkey"
            columns: ["from_destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_destination_id_fkey"
            columns: ["to_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_destination_id_fkey"
            columns: ["to_destination_id"]
            isOneToOne: false
            referencedRelation: "v_published_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_place_id_fkey"
            columns: ["to_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_connections_to_place_id_fkey"
            columns: ["to_place_id"]
            isOneToOne: false
            referencedRelation: "v_published_places"
            referencedColumns: ["id"]
          },
        ]
      }
      v_published_travel_estimates: {
        Row: {
          distance_m: number | null
          duration_seconds: number | null
          from_place_id: string | null
          mode: Database["public"]["Enums"]["travel_mode_enum"] | null
          to_place_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cleanup: { Args: never; Returns: boolean }
      _contract_on: { Args: { "": string }; Returns: unknown }
      _currtest: { Args: never; Returns: number }
      _db_privs: { Args: never; Returns: unknown[] }
      _extensions: { Args: never; Returns: unknown[] }
      _get: { Args: { "": string }; Returns: number }
      _get_latest: { Args: { "": string }; Returns: number[] }
      _get_note: { Args: { "": string }; Returns: string }
      _is_verbose: { Args: never; Returns: boolean }
      _prokind: { Args: { p_oid: unknown }; Returns: unknown }
      _query: { Args: { "": string }; Returns: string }
      _refine_vol: { Args: { "": string }; Returns: string }
      _retval: { Args: { "": string }; Returns: string }
      _table_privs: { Args: never; Returns: unknown[] }
      _temptypes: { Args: { "": string }; Returns: string }
      _todo: { Args: never; Returns: string }
      accessibility_for: {
        Args: { p_place_id: string; p_route_id: string }
        Returns: Json
      }
      col_is_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      col_not_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      consume_rate_limit: {
        Args: {
          p_key: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      critical_fields: { Args: { p_entity_table: string }; Returns: string[] }
      critical_fields_gated: {
        Args: {
          p_entity_id: string
          p_entity_table: string
          p_fields: string[]
        }
        Returns: boolean
      }
      derive_confidence: {
        Args: {
          p_conflict_flag: boolean
          p_freshness: Database["public"]["Enums"]["freshness_enum"]
          p_report_downgrade: boolean
          p_tier: Database["public"]["Enums"]["source_tier_enum"]
          p_verification_status: Database["public"]["Enums"]["verification_status_enum"]
        }
        Returns: Database["public"]["Enums"]["confidence_enum"]
      }
      derive_freshness: {
        Args: { p_valid_until: string; p_verified_at: string }
        Returns: Database["public"]["Enums"]["freshness_enum"]
      }
      diag:
        | {
            Args: { msg: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { msg: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      diag_test_name: { Args: { "": string }; Returns: string }
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      entity_trust: {
        Args: { p_entity_id: string; p_entity_table: string }
        Returns: Json
      }
      fail:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      findfuncs: { Args: { "": string }; Returns: string[] }
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] }
      format_type_string: { Args: { "": string }; Returns: string }
      has_any_locale: { Args: { p_value: Json }; Returns: boolean }
      has_any_role: {
        Args: { p_roles: Database["public"]["Enums"]["ops_role_enum"][] }
        Returns: boolean
      }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["ops_role_enum"] }
        Returns: boolean
      }
      has_unique: { Args: { "": string }; Returns: string }
      i18n_text: { Args: { p: Json }; Returns: string }
      in_todo: { Args: never; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      is_entity_published: {
        Args: { p_entity_id: string; p_entity_table: string }
        Returns: boolean
      }
      is_ops: { Args: never; Returns: boolean }
      isnt_empty: { Args: { "": string }; Returns: string }
      journey_summary_payload: {
        Args: { p_journey_id: string; p_locale: string }
        Returns: Json
      }
      latitude:
        | {
            Args: { "": Database["public"]["Tables"]["destinations"]["Row"] }
            Returns: {
              error: true
            } & "the function public.latitude with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Tables"]["places"]["Row"] }
            Returns: {
              error: true
            } & "the function public.latitude with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
      lives_ok: { Args: { "": string }; Returns: string }
      longitude:
        | {
            Args: { "": Database["public"]["Tables"]["destinations"]["Row"] }
            Returns: {
              error: true
            } & "the function public.longitude with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Tables"]["places"]["Row"] }
            Returns: {
              error: true
            } & "the function public.longitude with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
      my_journey_summary: {
        Args: { p_journey_id: string; p_locale?: string }
        Returns: Json
      }
      no_plan: { Args: never; Returns: boolean[] }
      num_failed: { Args: never; Returns: number }
      os_name: { Args: never; Returns: string }
      owns_journey: { Args: { p_journey_id: string }; Returns: boolean }
      owns_journey_item: { Args: { p_item_id: string }; Returns: boolean }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      prune_ai_cache: { Args: never; Returns: number }
      prune_rate_limits: { Args: { p_older_than?: string }; Returns: number }
      publish_entity: {
        Args: { p_entity_id: string; p_entity_table: string }
        Returns: Json
      }
      purge_deleted_accounts: { Args: { p_grace?: string }; Returns: Json }
      recompute_freshness: { Args: never; Returns: Json }
      record_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id: string
          p_entity_table: string
        }
        Returns: undefined
      }
      roll_journey_statuses: { Args: never; Returns: Json }
      route_stops_for: { Args: { p_route_id: string }; Returns: Json }
      run_scheduled_job: { Args: { p_name: string }; Returns: Json }
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      share_summary: {
        Args: { p_locale?: string; p_token: string }
        Returns: Json
      }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
      source_tier_label: {
        Args: { p_tier: Database["public"]["Enums"]["source_tier_enum"] }
        Returns: string
      }
      throws_ok: { Args: { "": string }; Returns: string }
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
      todo_end: { Args: never; Returns: boolean[] }
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { "": string }; Returns: boolean[] }
      validate_for_publish: {
        Args: { p_entity_id: string; p_entity_table: string }
        Returns: Json
      }
    }
    Enums: {
      age_band_enum: "child" | "adult" | "senior"
      ai_task_enum:
        | "intent_extract"
        | "explain"
        | "search_query"
        | "conversational_plan"
        | "extract_knowledge"
        | "detect_changes"
        | "contradiction_check"
        | "suggest_translation"
        | "classify"
        | "embed"
      availability_kind_enum:
        | "always_during_opening"
        | "daily_fixed_times"
        | "weekly_pattern"
        | "date_range"
        | "calendar_dates"
        | "on_request"
      change_trigger_enum:
        | "user_late"
        | "user_done_delta"
        | "user_stay_longer"
        | "knowledge_update"
        | "live_transport"
        | "live_weather"
        | "item_added"
        | "item_removed"
        | "preferences_changed"
        | "availability_changed"
      confidence_enum: "high" | "medium" | "low"
      difficulty_enum: "easy" | "moderate" | "hard"
      experience_type_enum:
        | "darshan"
        | "ritual"
        | "aarti"
        | "seva"
        | "festival"
        | "event"
        | "walk"
        | "cultural"
        | "other"
      facility_subtype_enum:
        | "restroom"
        | "drinking_water"
        | "cloakroom"
        | "medical"
        | "parking"
        | "atm"
        | "rest_area"
        | "help_desk"
      freshness_enum: "fresh" | "aging" | "stale"
      guidance_type_enum:
        | "before_you_go"
        | "what_to_carry"
        | "etiquette"
        | "timing_tip"
        | "safety"
        | "family"
        | "accessibility"
      health_state_enum: "comfortable" | "tight" | "at_risk" | "broken"
      journey_item_type_enum:
        | "experience"
        | "travel_leg"
        | "rest"
        | "meal"
        | "fixed_commitment"
        | "free_time"
      journey_status_enum:
        | "draft"
        | "upcoming"
        | "active"
        | "completed"
        | "archived"
      mobility_enum:
        | "full"
        | "limited_walking"
        | "wheelchair"
        | "needs_rest_frequently"
      notification_type_enum:
        | "prepare_deadline"
        | "journey_tomorrow"
        | "leave_by"
        | "journey_change"
        | "report_resolved"
        | "advisory"
        | "suggestion"
      ops_role_enum:
        | "researcher"
        | "reviewer"
        | "verifier"
        | "editor"
        | "approver"
        | "translator"
        | "media"
        | "support"
        | "admin"
      pace_enum: "relaxed" | "balanced" | "full"
      place_type_enum:
        | "temple"
        | "shrine"
        | "sacred_site"
        | "ghat"
        | "viewpoint"
        | "facility"
        | "transport_point"
        | "accommodation"
        | "food"
      priority_tier_enum: "fixed" | "protected" | "important" | "optional"
      publish_status_enum: "draft" | "in_review" | "published" | "archived"
      report_status_enum:
        | "new"
        | "triaged"
        | "verifying"
        | "resolved_updated"
        | "resolved_confirmed_correct"
        | "resolved_unverifiable"
        | "closed"
      report_type_enum:
        | "timing_changed"
        | "closed"
        | "accessibility_issue"
        | "wrong_information"
        | "outdated_guidance"
        | "other"
      review_task_type_enum:
        | "review"
        | "verify"
        | "conflict"
        | "approve"
        | "report"
        | "reverify"
      source_tier_enum: "T1" | "T2" | "T3" | "T4" | "T5"
      task_status_enum: "open" | "in_progress" | "done" | "rejected"
      travel_mode_enum:
        | "walk"
        | "vehicle"
        | "public_transport"
        | "hired"
        | "other"
      verification_status_enum:
        | "unverified"
        | "ai_extracted"
        | "human_reviewed"
        | "verified"
        | "disputed"
    }
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      age_band_enum: ["child", "adult", "senior"],
      ai_task_enum: [
        "intent_extract",
        "explain",
        "search_query",
        "conversational_plan",
        "extract_knowledge",
        "detect_changes",
        "contradiction_check",
        "suggest_translation",
        "classify",
        "embed",
      ],
      availability_kind_enum: [
        "always_during_opening",
        "daily_fixed_times",
        "weekly_pattern",
        "date_range",
        "calendar_dates",
        "on_request",
      ],
      change_trigger_enum: [
        "user_late",
        "user_done_delta",
        "user_stay_longer",
        "knowledge_update",
        "live_transport",
        "live_weather",
        "item_added",
        "item_removed",
        "preferences_changed",
        "availability_changed",
      ],
      confidence_enum: ["high", "medium", "low"],
      difficulty_enum: ["easy", "moderate", "hard"],
      experience_type_enum: [
        "darshan",
        "ritual",
        "aarti",
        "seva",
        "festival",
        "event",
        "walk",
        "cultural",
        "other",
      ],
      facility_subtype_enum: [
        "restroom",
        "drinking_water",
        "cloakroom",
        "medical",
        "parking",
        "atm",
        "rest_area",
        "help_desk",
      ],
      freshness_enum: ["fresh", "aging", "stale"],
      guidance_type_enum: [
        "before_you_go",
        "what_to_carry",
        "etiquette",
        "timing_tip",
        "safety",
        "family",
        "accessibility",
      ],
      health_state_enum: ["comfortable", "tight", "at_risk", "broken"],
      journey_item_type_enum: [
        "experience",
        "travel_leg",
        "rest",
        "meal",
        "fixed_commitment",
        "free_time",
      ],
      journey_status_enum: [
        "draft",
        "upcoming",
        "active",
        "completed",
        "archived",
      ],
      mobility_enum: [
        "full",
        "limited_walking",
        "wheelchair",
        "needs_rest_frequently",
      ],
      notification_type_enum: [
        "prepare_deadline",
        "journey_tomorrow",
        "leave_by",
        "journey_change",
        "report_resolved",
        "advisory",
        "suggestion",
      ],
      ops_role_enum: [
        "researcher",
        "reviewer",
        "verifier",
        "editor",
        "approver",
        "translator",
        "media",
        "support",
        "admin",
      ],
      pace_enum: ["relaxed", "balanced", "full"],
      place_type_enum: [
        "temple",
        "shrine",
        "sacred_site",
        "ghat",
        "viewpoint",
        "facility",
        "transport_point",
        "accommodation",
        "food",
      ],
      priority_tier_enum: ["fixed", "protected", "important", "optional"],
      publish_status_enum: ["draft", "in_review", "published", "archived"],
      report_status_enum: [
        "new",
        "triaged",
        "verifying",
        "resolved_updated",
        "resolved_confirmed_correct",
        "resolved_unverifiable",
        "closed",
      ],
      report_type_enum: [
        "timing_changed",
        "closed",
        "accessibility_issue",
        "wrong_information",
        "outdated_guidance",
        "other",
      ],
      review_task_type_enum: [
        "review",
        "verify",
        "conflict",
        "approve",
        "report",
        "reverify",
      ],
      source_tier_enum: ["T1", "T2", "T3", "T4", "T5"],
      task_status_enum: ["open", "in_progress", "done", "rejected"],
      travel_mode_enum: [
        "walk",
        "vehicle",
        "public_transport",
        "hired",
        "other",
      ],
      verification_status_enum: [
        "unverified",
        "ai_extracted",
        "human_reviewed",
        "verified",
        "disputed",
      ],
    },
  },
} as const

