"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Card, ConfirmModal, useToast } from "@/components/ui";

export function SessionsCard() {
  const { toast } = useToast();
  const [active, setActive] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function fetchActive(): Promise<number | null> {
    const data = await apiFetch<{ active: number }>("/api/auth/sessions");
    return typeof data.active === "number" ? data.active : null;
  }

  useEffect(() => {
    let cancelled = false;
    fetchActive().then(
      (n) => {
        if (!cancelled) setActive(n);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function revokeOthers() {
    setRevoking(true);
    try {
      const data = await apiFetch<{ revoked: number }>("/api/auth/sessions/revoke-others", {
        method: "POST",
      });
      toast({
        title: `Signed out ${data.revoked} other ${data.revoked === 1 ? "session" : "sessions"}`,
        variant: "success",
      });
      try {
        setActive(await fetchActive());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to sign out other sessions", variant: "error" });
    } finally {
      setRevoking(false);
      setConfirmOpen(false);
    }
  }

  const noOthers = active === null || active <= 1;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-sm text-content-primary">Sessions</h2>
            <p className="text-xs text-content-tertiary">
              {failed
                ? "Could not load the session count."
                : active === null
                  ? "Loading..."
                  : `${active} active ${active === 1 ? "session" : "sessions"} for this account, including this one.`}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={noOthers || revoking}
            loading={revoking}
            onClick={() => setConfirmOpen(true)}
          >
            Sign out other sessions
          </Button>
        </div>
      </Card>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={revokeOthers}
        title="Sign out other sessions"
        description="Every other session of this account will be signed out. This session stays signed in."
        confirmLabel="Sign out"
        variant="danger"
      />
    </>
  );
}
