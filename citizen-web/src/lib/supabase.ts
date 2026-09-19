"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * One browser client per tab.
 *
 * The anon key is public by design — Row Level Security in the database is what protects
 * the data, not this key. The service role key must never appear in this app.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, or set NEXT_PUBLIC_DATA_SOURCE=demo.",
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}
