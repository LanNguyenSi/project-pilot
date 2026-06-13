import { Button, Card } from "@/components/ui";

// Friendly landing page for the OAuth callback's error redirects
// (/auth/error?reason=...). Without it every reason 404s.
const MESSAGES: Record<string, { title: string; body: string }> = {
  missing_code: {
    title: "Sign-in incomplete",
    body: "GitHub did not return an authorization code. Please try signing in again.",
  },
  state_mismatch: {
    title: "Sign-in expired",
    body: "Your sign-in could not be verified or has expired. Please try again.",
  },
  oauth_failed: {
    title: "GitHub sign-in failed",
    body: "We could not verify your GitHub account. Please try again.",
  },
  email_collision: {
    title: "Account already exists",
    body: "An account already uses this email. Sign in with your email and password, then link GitHub from Settings.",
  },
  server_error: {
    title: "Something went wrong",
    body: "We hit an unexpected error while completing your sign-in. Please try again in a moment.",
  },
};

const FALLBACK = {
  title: "Sign-in error",
  body: "We could not complete your sign-in. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const msg = (reason && MESSAGES[reason]) || FALLBACK;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div
            className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center shadow-card mb-3"
            aria-hidden="true"
          >
            <span className="text-white text-lg font-bold font-display leading-none">P</span>
          </div>
          <span className="text-sm font-semibold font-display text-content-primary tracking-tight">
            project-pilot
          </span>
        </div>

        <Card variant="elevated" className="p-6 text-center">
          <h1 className="text-section-title font-display text-content-primary">{msg.title}</h1>
          <p className="text-body text-content-secondary mt-2">{msg.body}</p>
          <Button href="/login" className="w-full mt-6" size="lg">
            Back to sign in
          </Button>
        </Card>
      </div>
    </main>
  );
}
