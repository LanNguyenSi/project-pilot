"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AuthProvider } from "@/lib/auth-context";

const COLLAPSED_KEY = "sidebar-collapsed";

// The collapsed flag lives in localStorage. Reading it through
// useSyncExternalStore keeps the server render and the hydration pass on the
// expanded layout (server snapshot false) and switches to the stored value
// right after hydration, as the previous mount effect did.
const collapsedListeners = new Set<() => void>();
function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  // Another tab writing the key re-renders this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === COLLAPSED_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    collapsedListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function readCollapsed() {
  return localStorage.getItem(COLLAPSED_KEY) === "true";
}
function readCollapsedOnServer() {
  return false;
}

// Routes that embed an external module via iframe and need the full viewport
// width/height , the default max-w-6xl + px-6 py-6 wrapper letterboxes them.
const FULL_BLEED_ROUTES = ["/security"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, readCollapsedOnServer);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    localStorage.setItem(COLLAPSED_KEY, String(!readCollapsed()));
    collapsedListeners.forEach((listener) => listener());
  }

  return (
    // AuthProvider fetches /api/auth/me once per shell mount and shares it
    // with TopBar and any page below (e.g. Dashboard), instead of each
    // fetching it independently.
    <AuthProvider>
      {/* Skip link: first focusable element on every page, hidden until it
          receives focus so keyboard users can jump the seven sidebar stops.
          focus:fixed (not sr-only alone) so it floats over the content it
          bypasses instead of pushing the layout down. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-button focus:bg-surface-overlay focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-content-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/60"
      >
        Skip to main content
      </a>
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
          {/* id + tabIndex -1 let the skip link move focus here. The aria-label
              gives this main a name: the /security iframe embeds a same-origin
              document with its own (unnamed) main, and two same-document
              landmarks only collide when neither is named (axe
              landmark-unique). A static label beats aria-labelledby on a page
              <h1> here: the shell cannot see the page's DOM to reference an id,
              and the name is present even while a page is loading or erroring. */}
          <main
            key={pathname}
            id="main-content"
            tabIndex={-1}
            aria-label="Content"
            className={`animate-fade-in${fullBleed ? "" : " max-w-6xl mx-auto px-6 py-6"}`}
          >
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
