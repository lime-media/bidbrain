"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    console.log("[BidBrain] Sign-in clicked", { email });
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("[BidBrain] Auth result:", { data, error: authError });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      console.error("[BidBrain] Sign-in exception:", err);
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            <span className="text-[#4B1F93]">Bid</span>
            <span className="text-[#94CE3C]">Brain</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Sign in to access procurement intelligence
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C]"
              placeholder="you@limemedia.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#4B1F93] py-2.5 text-sm font-semibold text-white hover:bg-[#3d1877] transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
