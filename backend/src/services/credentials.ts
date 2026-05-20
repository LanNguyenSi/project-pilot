import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";

export type ServiceName = "project-forge" | "agent-tasks" | "deploy-panel";

export const VALID_SERVICES: ServiceName[] = ["project-forge", "agent-tasks", "deploy-panel"];

export function isValidService(s: string): s is ServiceName {
  return VALID_SERVICES.includes(s as ServiceName);
}

export interface CredentialSummary {
  id: string;
  service: string;
  label: string | null;
  updatedAt: Date;
}

export async function upsertCredential(userId: string, service: ServiceName, token: string, label?: string) {
  const encrypted = encrypt(token);

  return prisma.serviceCredential.upsert({
    where: { userId_service: { userId, service } },
    create: { userId, service, token: encrypted, label },
    update: { token: encrypted, label },
    select: { id: true, service: true, label: true, updatedAt: true },
  });
}

export async function getCredential(userId: string, service: ServiceName): Promise<string | null> {
  const cred = await prisma.serviceCredential.findUnique({
    where: { userId_service: { userId, service } },
  });

  if (!cred) return null;
  return decrypt(cred.token);
}

export async function listCredentials(userId: string): Promise<CredentialSummary[]> {
  const creds = await prisma.serviceCredential.findMany({
    where: { userId },
    select: { id: true, service: true, label: true, updatedAt: true },
  });
  return creds;
}

export async function deleteCredential(userId: string, service: ServiceName) {
  return prisma.serviceCredential.delete({
    where: { userId_service: { userId, service } },
  });
}
