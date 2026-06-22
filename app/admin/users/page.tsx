"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";

interface User {
  id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
}

async function getJwt(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const jwt = await getJwt();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(options.headers ?? {}),
    },
  });
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/admin/users");
    if (res.status === 403) {
      router.replace("/");
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load users");
    } else {
      setUsers(data.users);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    setAddSuccess(null);

    const res = await apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, is_admin: makeAdmin }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAddError(data.error ?? "Failed to create user");
    } else {
      setAddSuccess(`Created ${data.user.email}`);
      setEmail("");
      setPassword("");
      setMakeAdmin(false);
      await loadUsers();
    }
    setAdding(false);
  };

  const toggleAdmin = async (user: User) => {
    setActionError(null);
    const res = await apiFetch("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ id: user.id, is_admin: !user.is_admin }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error ?? "Failed to update user");
    } else {
      await loadUsers();
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setActionError(null);
    const res = await apiFetch("/api/admin/users", {
      method: "DELETE",
      body: JSON.stringify({ id: user.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error ?? "Failed to delete user");
    } else {
      await loadUsers();
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <Link href="/" className="text-sm text-[#5a8a15] dark:text-[#94CE3C] hover:underline">← Dashboard</Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Users</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create and manage user accounts. Users can log in with their email and password.
        </p>
      </div>

      {/* Add user form */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Add new user</p>
        </div>
        <form onSubmit={handleAdd} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#94CE3C]/50"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#94CE3C]/50"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={makeAdmin}
                onChange={(e) => setMakeAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#94CE3C] focus:ring-[#94CE3C]/50"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Make admin</span>
            </label>
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-[#94CE3C] px-6 py-2 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
            >
              {adding ? "Creating…" : "Create user"}
            </button>
          </div>
          {addError && (
            <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>
          )}
          {addSuccess && (
            <p className="text-sm text-green-700 dark:text-green-400">{addSuccess}</p>
          )}
        </form>
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            All users {!loading && `(${users.length})`}
          </p>
        </div>

        {actionError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">Loading…</div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{user.email}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {user.is_admin ? (
                      <span className="inline-flex items-center rounded-full bg-[#94CE3C]/15 px-2 py-0.5 text-xs font-semibold text-[#5a8a15] dark:text-[#94CE3C]">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => toggleAdmin(user)}
                      className="text-xs font-medium text-[#5a8a15] dark:text-[#94CE3C] hover:underline"
                    >
                      {user.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                    <button
                      onClick={() => deleteUser(user)}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
