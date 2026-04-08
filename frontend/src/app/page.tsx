export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">project-pilot</h1>
        <p className="text-gray-400 mb-8">
          Unified control plane — Create · Develop · Deploy
        </p>
        <a
          href="/login"
          className="rounded-lg bg-white text-black px-6 py-2.5 text-sm font-medium hover:bg-gray-200"
        >
          Get started
        </a>
      </div>
    </main>
  );
}
