"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const COLLAPSED_KEY = "sidebar-collapsed";

// Routes that embed an external module via iframe and need the full viewport
// width/height , the default max-w-6xl + px-6 py-6 wrapper letterboxes them.
const FULL_BLEED_ROUTES = ["/security"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
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
        {/* key={pathname} remounts the element on each navigation, re-triggering
            animate-fade-in. This gives a subtle page-transition entrance without
            a full animation library. */}
        <main
          key={pathname}
          className={`animate-fade-in${fullBleed ? "" : " max-w-6xl mx-auto px-6 py-6"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
