import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// Browser client — uses anon key, respects RLS (singleton)
// Configured with cookie storage so the proxy (middleware) can read auth state
export function getSupabaseBrowser() {
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",
          storage: {
            getItem: (key) => {
              if (typeof document === "undefined") return null;
              const match = document.cookie.match(
                new RegExp("(^| )" + encodeURIComponent(key) + "=([^;]+)")
              );
              return match ? decodeURIComponent(match[2]) : null;
            },
            setItem: (key, value) => {
              if (typeof document === "undefined") return;
              document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
            },
            removeItem: (key) => {
              if (typeof document === "undefined") return;
              document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0`;
            },
          },
        },
      }
    );
  }
  return browserClient;
}

// Server client — uses service role key, bypasses RLS
export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
