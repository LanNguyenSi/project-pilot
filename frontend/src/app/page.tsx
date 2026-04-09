import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--surface-secondary)_0%,_var(--surface-primary)_70%)]">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-content-primary mb-2">project-pilot</h1>
        <p className="text-content-secondary mb-8">
          Unified control plane — Create · Develop · Deploy
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium bg-accent-blue text-white hover:bg-accent-blue/90 rounded-button transition-colors duration-fast"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
