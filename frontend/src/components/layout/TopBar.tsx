"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./Breadcrumbs";
import { Icon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth-context";

interface TopBarProps {
  onMenuClick: () => void;
}

/** Returns up to 2 uppercase initials from a user's name, or the email. */
function getInitials(user: User): string {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const router = useRouter();
  // Shared with the rest of the (app) shell via AuthContext (see AppShell),
  // instead of fetching /api/auth/me here independently. Errors there are
  // swallowed (a transient failure or a 401): the menu still renders with a
  // fallback identity, so the logout action is never hidden. Each page
  // handles its own auth redirect; the shell does not.
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on Escape.
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  // Close dropdown on click-outside.
  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", onOutsideClick);
    };
  }, [open, handleKey]);

  async function handleLogout() {
    setOpen(false);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed to login even if the request fails.
    }
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 h-topbar flex items-center gap-4 px-6 bg-surface-primary border-b border-stroke-default">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-content-secondary hover:text-content-primary transition-colors duration-fast"
        aria-label="Open navigation"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Breadcrumbs */}
      <div className="flex-1 min-w-0">
        <Breadcrumbs />
      </div>

      {/* User menu. Always rendered, even if the /api/auth/me fetch failed, so
          the logout action is never hidden; identity falls back gracefully. */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label="User menu"
          className="flex items-center gap-2 px-2 py-1.5 rounded-button hover:bg-surface-overlay transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          {/* Brand-tinted avatar: initials when known, generic glyph otherwise */}
          <span className="h-7 w-7 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
            {user ? (
              getInitials(user)
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            )}
          </span>
          {/* Email, visible on sm+ screens */}
          <span className="hidden sm:block text-sm text-content-secondary max-w-[160px] truncate">
            {user?.email ?? "Account"}
          </span>
          <Icon
            name="chevron-right"
            size={14}
            className={`text-content-tertiary transition-transform duration-fast ${open ? "rotate-90" : ""}`}
          />
        </button>

        {/* Dropdown: a plain disclosure (single action), not an ARIA menu. */}
        {open && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-surface-elevated rounded-card shadow-elevated border border-stroke-default py-1 z-50 animate-fade-in">
            {/* User info header, only when the user is known */}
            {user && (
              <div className="px-3 py-2.5 border-b border-stroke-subtle">
                {user.name && (
                  <p className="text-sm font-medium text-content-primary truncate">{user.name}</p>
                )}
                <p className="text-xs text-content-tertiary truncate">{user.email}</p>
              </div>
            )}

            {/* Logout action */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-content-secondary hover:text-content-primary hover:bg-surface-overlay transition-colors duration-fast focus-visible:outline-none focus-visible:bg-surface-overlay"
            >
              <Icon name="logout" size={16} />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
