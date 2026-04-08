export interface Config {
  forgeUrl: string;
  forgeApiKey: string;
  tasksUrl: string;
  tasksToken: string;
  deployUrl: string;
  deployApiKey: string;
}

export function loadConfig(): Config {
  const forgeApiKey = process.env.FORGE_API_KEY ?? "";
  const tasksToken = process.env.TASKS_TOKEN ?? "";
  const deployApiKey = process.env.DEPLOY_API_KEY ?? "";

  return {
    forgeUrl: process.env.FORGE_URL ?? "https://project-forge.opentriologue.ai",
    forgeApiKey,
    tasksUrl: process.env.TASKS_URL ?? "https://agent-tasks.opentriologue.ai",
    tasksToken,
    deployUrl: process.env.DEPLOY_URL ?? "https://deploy-panel.opentriologue.ai",
    deployApiKey,
  };
}
