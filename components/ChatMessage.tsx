"use client";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
}

export default function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-[#94CE3C] text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
}
