"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const labelMap: Record<string, string> = {
  dashboard: "Dashboard",
  forge: "Forge",
  tasks: "Tasks",
  deploys: "Deploys",
  security: "Security",
  settings: "Settings",
  create: "Create",
};

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    const label = labelMap[seg] || (isUuid(seg) ? seg.slice(0, 8) + "…" : seg);
    return { href, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="text-sm min-w-0">
      <ol className="flex items-center gap-1">
        {crumbs.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1 min-w-0">
            {crumb.href !== crumbs[0].href && (
              <svg className="h-3.5 w-3.5 text-content-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            {crumb.isLast ? (
              <span className="text-content-primary font-medium truncate max-w-[200px]" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-content-secondary hover:text-content-primary truncate max-w-[200px] transition-colors duration-fast"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
