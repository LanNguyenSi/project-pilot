interface SkeletonBoxProps {
  className?: string;
  width?: string;
  height?: string;
}

export function SkeletonBox({ className = "", width, height }: SkeletonBoxProps) {
  return (
    <div
      className={`bg-surface-tertiary rounded-md animate-pulse ${className}`}
      style={{ width, height }}
    />
  );
}

/** Simulates a stat card (dashboard). */
export function SkeletonCard() {
  return (
    <div className="bg-surface-secondary border border-stroke-default rounded-card p-6 space-y-3">
      <SkeletonBox className="h-3 w-24" />
      <SkeletonBox className="h-8 w-16" />
      <SkeletonBox className="h-3 w-32" />
    </div>
  );
}

/** Simulates a task or deploy row. */
export function SkeletonRow() {
  return (
    <div className="bg-surface-secondary border border-stroke-default rounded-card p-4 flex items-center gap-4">
      <SkeletonBox className="h-5 w-16 rounded-badge" />
      <SkeletonBox className="h-5 w-14 rounded-badge" />
      <SkeletonBox className="h-4 flex-1 max-w-sm" />
      <SkeletonBox className="h-3 w-20" />
    </div>
  );
}

/** Simulates a project card in a grid. */
export function SkeletonProjectCard() {
  return (
    <div className="bg-surface-secondary border border-stroke-default rounded-card p-4 space-y-2">
      <SkeletonBox className="h-4 w-28" />
      <SkeletonBox className="h-3 w-full" />
      <SkeletonBox className="h-3 w-2/3" />
    </div>
  );
}

/** Full page skeleton: title + grid of cards. */
export function SkeletonPage({ cards = 6 }: { cards?: number }) {
  return (
    <div>
      <SkeletonBox className="h-7 w-40 mb-6" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonProjectCard key={i} />
        ))}
      </div>
    </div>
  );
}

/** Dashboard skeleton: title + stat cards + rows. */
export function SkeletonDashboard() {
  return (
    <div>
      <SkeletonBox className="h-7 w-40 mb-2" />
      <SkeletonBox className="h-4 w-48 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

/** Task list skeleton: title + rows. */
export function SkeletonTaskList({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <SkeletonBox className="h-7 w-40" />
          <SkeletonBox className="h-4 w-64 mt-2" />
        </div>
        <SkeletonBox className="h-9 w-28 rounded-button" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
