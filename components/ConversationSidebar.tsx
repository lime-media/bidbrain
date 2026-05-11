"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export default function ConversationSidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) setUserId(data.user.id);
      });
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/conversations?userId=${userId}`)
      .then((r) => r.json())
      .then(({ conversations: convs }) => setConversations(convs || []));
  }, [userId, pathname]);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/conversations/${id}?userId=${userId}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (pathname === `/chat/${id}`) router.push("/chat");
  };

  const grouped = groupByDate(conversations);

  return (
    <div className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <Link
          href="/chat"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-[#4B1F93] text-white hover:bg-[#3d1877] transition-colors"
        >
          + New Chat
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(grouped).map(([label, convs]) => (
          <div key={label} className="mb-3">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 py-1">
              {label}
            </p>
            {convs.map((conv) => {
              const isActive = pathname === `/chat/${conv.id}`;
              return (
                <div key={conv.id} className="group relative mx-1">
                  <Link
                    href={`/chat/${conv.id}`}
                    title={conv.title}
                    className={`block px-3 py-2 rounded-lg text-sm truncate transition-colors pr-7 ${
                      isActive
                        ? "bg-[#94CE3C]/15 text-[#4B1F93] dark:text-[#94CE3C] font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60"
                    }`}
                  >
                    {conv.title}
                  </Link>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    title="Delete conversation"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ))}

        {conversations.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center px-3 py-8">
            No conversations yet
          </p>
        )}
      </div>
    </div>
  );
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = new Date();
  const groups: Record<string, Conversation[]> = {};

  for (const conv of conversations) {
    const diff = Math.floor(
      (now.getTime() - new Date(conv.updated_at).getTime()) / 86400000
    );
    const label =
      diff === 0
        ? "Today"
        : diff === 1
        ? "Yesterday"
        : diff <= 7
        ? "Last 7 days"
        : diff <= 30
        ? "Last 30 days"
        : new Date(conv.updated_at).toLocaleString("default", {
            month: "long",
            year: "numeric",
          });

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }

  return groups;
}
