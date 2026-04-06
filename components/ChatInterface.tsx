"use client";

import { useState, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";
import ResultsTable from "./ResultsTable";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
  results?: Record<string, unknown>[] | null;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build history for context (just role + content)
      const history = messages.map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer,
        sql: data.sql,
        results: data.results,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="text-4xl">&#129504;</div>
            <h2 className="text-lg font-medium text-gray-700">
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
            <ChatMessage role={msg.role} content={msg.content} sql={msg.sql} />
            {msg.results && msg.results.length > 0 && (
              <div className="ml-4">
                <ResultsTable data={msg.results} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
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
      <div className="border-t pt-4">
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
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C]"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-[#4B1F93] px-6 py-3 text-sm font-semibold text-white hover:bg-[#3d1877] transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
