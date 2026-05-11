"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const links = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/upload", label: "Upload", exact: true },
  { href: "/documents", label: "Documents", exact: false },
  { href: "/chat", label: "Chat", exact: false },
  { href: "/admin/sync", label: "Sync Excel", exact: true },
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

  if (pathname === "/auth/login") return null;

  return (
    <nav className="bg-[#94CE3C] shadow-sm">
      <div className="max-w-6xl mx-auto px-6 flex items-center h-14 gap-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight text-white">
          <Image
            src="/lime-icon.png"
            alt="Lime Media"
            width={36}
            height={36}
          />
          BidBrain
        </Link>
        <div className="flex gap-1 flex-1">
          {links.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                (exact ? pathname === href : pathname.startsWith(href))
                  ? "bg-white/25 text-white"
                  : "text-white/80 hover:bg-white/15 hover:text-white"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        {email && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/70">{email}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-white/70 hover:text-white font-medium transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
