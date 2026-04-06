"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/chat", label: "Chat" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email || null);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  // Don't show nav on login page
  if (pathname === "/auth/login") return null;

  return (
    <nav className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-6 flex items-center h-14 gap-8">
        <Link href="/" className="font-bold text-lg tracking-tight">
          <span className="text-[#4B1F93]">Bid</span>
          <span className="text-[#94CE3C]">Brain</span>
        </Link>
        <div className="flex gap-1 flex-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-[#94CE3C]/10 text-[#4B1F93]"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        {email && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{email}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
