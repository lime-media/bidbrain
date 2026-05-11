import { getSupabaseServer } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ conversations: data });
}

export async function POST(request: Request) {
  const { userId, title } = await request.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: title || "New conversation" })
    .select("id, title")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
