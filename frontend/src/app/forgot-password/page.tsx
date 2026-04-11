"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always show success to prevent account enumeration
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <h1 className="text-section-title text-content-primary">Reset password</h1>
          <p className="text-content-secondary text-sm mt-1">
            Enter your email to receive a reset link.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-content-secondary">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </p>
            <Link href="/login" className="text-sm text-accent-blue hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Send reset link
            </Button>
            <div className="text-center">
              <Link href="/login" className="text-xs text-content-tertiary hover:text-content-primary transition-colors">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
