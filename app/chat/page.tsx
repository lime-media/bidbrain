import ChatInterface from "@/components/ChatInterface";

export default function ChatPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Bid Brain Chat</h1>
      <p className="text-gray-500 mb-6">
        Ask questions about vendors, pricing, materials, and project spend.
      </p>
      <ChatInterface />
    </main>
  );
}
