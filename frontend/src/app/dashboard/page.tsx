"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              Welcome, {user?.name || user?.email}
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/settings"
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
            >
              Settings
            </a>
            <button
              onClick={async () => {
                await apiFetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
              }}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
            <h2 className="text-sm font-medium text-gray-400">Projects</h2>
            <p className="text-3xl font-bold mt-2">—</p>
            <p className="text-xs text-gray-500 mt-1">via project-forge</p>
          </div>
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
            <h2 className="text-sm font-medium text-gray-400">Open Tasks</h2>
            <p className="text-3xl font-bold mt-2">—</p>
            <p className="text-xs text-gray-500 mt-1">via agent-tasks</p>
          </div>
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
            <h2 className="text-sm font-medium text-gray-400">Servers</h2>
            <p className="text-3xl font-bold mt-2">—</p>
            <p className="text-xs text-gray-500 mt-1">via deploy-panel</p>
          </div>
        </div>
      </div>
    </main>
  );
}
