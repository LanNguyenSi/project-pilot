import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--surface-secondary)_0%,_var(--surface-primary)_70%)]">
      <div className="text-center animate-fade-in px-4">
        {/* Brand mark */}
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-brand-500 flex items-center justify-center shadow-elevated">
            <span className="text-white text-3xl font-bold font-display leading-none">P</span>
          </div>
        </div>

        <h1 className="text-5xl font-bold font-display tracking-tight text-content-primary mb-3">
          project-pilot
        </h1>
        <p className="text-content-secondary mb-8 max-w-sm mx-auto">
          Unified control plane - Create, Develop, Deploy
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-button transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
