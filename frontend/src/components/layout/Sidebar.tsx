"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useCallback, useRef } from "react";
import { Icon } from "@/components/ui/icons";

// Nav items for the main section of the sidebar.
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" as const },
  { label: "Forge",     href: "/forge",     icon: "forge"     as const },
  { label: "Tasks",     href: "/tasks",     icon: "tasks"     as const },
  { label: "Deploys",   href: "/deploys",   icon: "rocket"    as const },
  { label: "Security",  href: "/security",  icon: "shield"    as const },
];

const settingsItem = { label: "Settings", href: "/settings", icon: "settings" as const };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close mobile sidebar on route change.
  useEffect(() => {
    onMobileClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key closes the mobile overlay.
  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onMobileClose(); },
    [onMobileClose],
  );

  useEffect(() => {
    if (mobileOpen) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen, handleKey]);

  // Renders a single nav link with brand active state and a left accent bar.
  function navLink(item: { label: string; href: string; icon: typeof navItems[number]["icon"] | typeof settingsItem["icon"] }) {
    const active = isActive(pathname, item.href);
    const showLabel = !collapsed || mobileOpen;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={!showLabel ? item.label : undefined}
        title={!showLabel ? item.label : undefined}
        className={`relative flex items-center gap-3 rounded-button text-sm transition-colors duration-fast
          ${showLabel ? "px-3 py-2" : "justify-center px-2 py-2"}
          ${active
            ? "text-brand-300 bg-brand-500/10 font-medium"
            : "text-content-secondary hover:text-content-primary hover:bg-surface-tertiary"
          }`}
      >
        {/* Left accent bar - only when label is visible (not in icon-only collapsed mode) */}
        {active && showLabel && (
          <span
            className="absolute left-0 inset-y-2 w-0.5 bg-brand-500 rounded-r"
            aria-hidden="true"
          />
        )}
        <Icon name={item.icon} size={18} />
        {showLabel && <span>{item.label}</span>}
      </Link>
    );
  }

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-col h-full">
      {/* Brand mark + wordmark */}
      <div className="h-topbar flex items-center px-4 border-b border-stroke-default shrink-0 gap-2.5">
        {/* Violet "P" emblem */}
        <div
          className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <span className="text-white text-sm font-bold font-display leading-none">P</span>
        </div>
        {/* Wordmark - hidden when collapsed on desktop, always shown in mobile overlay */}
        {(!collapsed || mobileOpen) && (
          <span className="text-sm font-semibold font-display text-content-primary tracking-tight">
            project-pilot
          </span>
        )}
      </div>

      {/* Main navigation links */}
      <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => navLink(item))}
      </div>

      {/* Bottom section: settings + collapse toggle */}
      <div className="border-t border-stroke-default py-3 px-2 space-y-0.5 shrink-0">
        {navLink(settingsItem)}

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`hidden lg:flex w-full items-center gap-3 rounded-button text-sm text-content-tertiary hover:text-content-primary hover:bg-surface-tertiary transition-colors duration-fast
            ${(!collapsed) ? "px-3 py-2" : "justify-center px-2 py-2"}`}
        >
          <Icon
            name="chevron-left"
            size={18}
            className={`transition-transform duration-fast ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen bg-surface-secondary border-r border-stroke-default z-40 overflow-hidden">
        {nav}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="lg:hidden fixed inset-0 z-50"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="relative w-sidebar h-full bg-surface-secondary border-r border-stroke-default">
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
