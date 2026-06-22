import { getSupabaseServer } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const jwt = auth.slice(7);

  const supabase = getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return null;

  return user;
}

// GET /api/admin/users — list all users
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseServer();
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await supabase.from("profiles").select("id, is_admin");
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  const result = users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    is_admin: profileMap[u.id]?.is_admin ?? false,
  }));

  return NextResponse.json({ users: result });
}

// POST /api/admin/users — create a user
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email, password, is_admin = false } = await req.json();
  if (!email || !password)
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (is_admin) {
    await supabase.from("profiles").upsert({ id: data.user.id, is_admin: true });
  }

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } });
}

// PATCH /api/admin/users — toggle admin status
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, is_admin } = await req.json();
  if (!id) return NextResponse.json({ error: "User ID required" }, { status: 400 });
  if (id === admin.id && !is_admin)
    return NextResponse.json({ error: "Cannot remove your own admin status" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { error } = await supabase.from("profiles").upsert({ id, is_admin });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/users — delete a user
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "User ID required" }, { status: 400 });
  if (id === admin.id)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
