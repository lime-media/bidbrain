import ChatInterface from "@/components/ChatInterface";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="h-full max-w-4xl mx-auto px-6 py-6 flex flex-col">
      <ChatInterface conversationId={id} />
    </div>
  );
}
