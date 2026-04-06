"use client";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
}

export default function ChatMessage({ role, content, sql }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-[#4B1F93] text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
        {sql && !isUser && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
              View SQL query
            </summary>
            <pre className="mt-1 p-2 rounded bg-gray-200 text-gray-700 overflow-x-auto font-mono">
              {sql}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
