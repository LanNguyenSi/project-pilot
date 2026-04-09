"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const COLLAPSED_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  return (
    <div
      className="min-h-screen lg:grid transition-[grid-template-columns] duration-normal"
      style={{ gridTemplateColumns: collapsed ? "4rem 1fr" : "15rem 1fr" }}
    >
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="min-w-0">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="max-w-6xl mx-auto px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
