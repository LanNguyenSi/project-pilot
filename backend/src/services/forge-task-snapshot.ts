import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Shape of a single task as it appears in a project-forge `generate` preview
 * (`preview.tasks[]`). Mirrors the frontend `Task` interface in
 * forge/create/page.tsx. All fields beyond `id`/`title` are best-effort: forge
 * is an external service and older planforge versions may omit them.
 */
export interface ForgePreviewTask {
  id: string;
  title: string;
  wave?: string;
  priority?: string;
  summary?: string;
}

/**
 * Canonicalize a GitHub repo URL to `owner/repo`. Snapshots are keyed on this
 * normalized form (not the raw URL) so a snapshot stored from forge's publish
 * response still matches a lookup using the URL from forge's projects list,
 * regardless of trailing `.git`, trailing slash, scheme, or SSH-vs-HTTPS.
 * Returns the trimmed input unchanged if it doesn't look like a GitHub URL.
 */
export function repoKey(repoUrl: string): string {
  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return match ? match[1].toLowerCase() : repoUrl.trim().toLowerCase();
}

/**
 * Pull the task array out of a forge preview payload defensively. Returns an
 * empty array for anything that doesn't look like `{ tasks: [...] }` so a
 * shape change upstream degrades to "nothing to migrate" rather than throwing
 * inside the generate proxy.
 */
export function extractPreviewTasks(preview: unknown): ForgePreviewTask[] {
  if (!preview || typeof preview !== "object") return [];
  const tasks = (preview as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(
    (t): t is ForgePreviewTask =>
      !!t && typeof t === "object" && typeof (t as ForgePreviewTask).id === "string" && typeof (t as ForgePreviewTask).title === "string",
  );
}

/**
 * Persist (or replace) the preview task snapshot for a forge session. Idempotent
 * on (userId, sessionId) so re-generating the same session overwrites cleanly.
 */
export async function saveForgeTaskSnapshot(
  userId: string,
  sessionId: string,
  tasks: ForgePreviewTask[],
): Promise<void> {
  const data = tasks as unknown as Prisma.InputJsonValue;
  await prisma.forgeTaskSnapshot.upsert({
    where: { userId_sessionId: { userId, sessionId } },
    create: { userId, sessionId, tasks: data },
    update: { tasks: data },
  });
}

/**
 * Link a snapshot to the repo it was published to. Best-effort: a missing
 * snapshot (e.g. generated before this feature shipped) must not fail publish.
 */
export async function linkForgeSnapshotToRepo(
  userId: string,
  sessionId: string,
  repoUrl: string,
): Promise<void> {
  await prisma.forgeTaskSnapshot.updateMany({
    where: { userId, sessionId },
    data: { repoUrl: repoKey(repoUrl) },
  });
}

export async function getForgeSnapshotByRepo(
  userId: string,
  repoUrl: string,
): Promise<ForgePreviewTask[] | null> {
  const snapshot = await prisma.forgeTaskSnapshot.findFirst({
    where: { userId, repoUrl: repoKey(repoUrl) },
    orderBy: { createdAt: "desc" },
  });
  if (!snapshot) return null;
  return snapshot.tasks as unknown as ForgePreviewTask[];
}

/** Drop a snapshot once its tasks have been migrated successfully. */
export async function deleteForgeSnapshotByRepo(userId: string, repoUrl: string): Promise<void> {
  await prisma.forgeTaskSnapshot.deleteMany({ where: { userId, repoUrl: repoKey(repoUrl) } });
}
