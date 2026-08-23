import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  console.warn(
    "[amharic-fidel] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — " +
      "shared 'Everyone' recordings will fall back to this browser's own " +
      "localStorage instead of syncing across devices. See README for setup."
  );
}

export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;
