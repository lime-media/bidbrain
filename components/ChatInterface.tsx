"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChatMessage from "./ChatMessage";
import ResultsTable from "./ResultsTable";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
  results?: Record<string, unknown>[] | null;
}

interface Props {
  conversationId?: string;
}

export default function ChatInterface({ conversationId: initialConvId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(initialConvId || null);
  const [userId, setUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  // Load messages when opening an existing conversation
  useEffect(() => {
    if (!initialConvId || !userId) return;
    setMessages([]);
    fetch(`/api/conversations/${initialConvId}?userId=${userId}`)
      .then((r) => r.json())
      .then(({ messages: msgs }) => {
        if (!msgs) return;
        setMessages(
          msgs.map((m: {
            role: string;
            content: string;
            sql_query?: string | null;
            results?: Record<string, unknown>[] | null;
          }) => ({
            role: m.role,
            content: m.content,
            sql: m.sql_query,
            results: m.results,
          }))
        );
      });
  }, [initialConvId, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      // Include a compact summary of query results in assistant messages so Claude
      // can answer follow-up questions ("what's the quote number for that one?")
      // without losing context of what data was actually returned.
      const history = messages.map(({ role, content, results }) => ({
        role,
        content:
          role === "assistant" && results && results.length > 0
            ? `${content}\n\n[Data returned: ${JSON.stringify(results.slice(0, 10))}]`
            : content,
      }));

      // Create a new conversation on the first message
      let activeConvId = convId;
      if (!activeConvId && userId) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, title: question.slice(0, 60) }),
        });
        const created = await res.json();
        activeConvId = created.id;
        setConvId(activeConvId);
        router.replace(`/chat/${activeConvId}`);
      }

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, conversationId: activeConvId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sql: data.sql,
          results: data.results,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="text-4xl">&#129504;</div>
            <h2 className="text-lg font-medium text-gray-700 dark:text-gray-300">
              Ask Bid Brain anything about procurement
            </h2>
            <div className="text-sm text-gray-400 space-y-1">
              <p>&quot;Who&apos;s cheapest for Baltic birch?&quot;</p>
              <p>&quot;How has aluminum pricing changed this year?&quot;</p>
              <p>&quot;Compare Trident vs Eastern Metal on square tube&quot;</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="space-y-2">
            <ChatMessage role={msg.role} content={msg.content} />
            {msg.results && msg.results.length > 0 && (
              <div className="ml-4">
                <ResultsTable data={msg.results} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t dark:border-gray-700 pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about vendors, pricing, materials..."
            className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-4 py-3 text-sm focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C]"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-[#94CE3C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
