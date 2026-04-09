import { SkeletonCard } from "@/components/ui";

export default function SettingsLoading() {
  return (
    <div>
      <div className="bg-surface-tertiary rounded-md animate-pulse h-7 w-32 mb-8" />
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
