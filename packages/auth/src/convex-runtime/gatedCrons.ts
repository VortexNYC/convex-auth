import { cronJobs } from "convex/server";

type ConvexCronJobs = ReturnType<typeof cronJobs>;
type CronRegistrationMethod = "cron" | "daily" | "hourly" | "interval" | "monthly" | "weekly";

const cronRegistrationMethods = new Set<PropertyKey>([
  "cron",
  "daily",
  "hourly",
  "interval",
  "monthly",
  "weekly",
] satisfies CronRegistrationMethod[]);

/**
 * Read via globalThis so this module typechecks in non-node tsconfigs (browser
 * sandboxes) while still seeing the Convex runtime's process.env.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

function cronsAreEnabled(): boolean {
  return env?.CRONS_ENABLED === "true";
}

/**
 * Convex crons run on every deployment unless registration is gated. Register
 * scheduled work only on the deployment where CRONS_ENABLED=true (production),
 * keeping dev, preview, staging, and CI deployments at zero cron registrations.
 */
export function gatedCrons(): ConvexCronJobs {
  const crons = cronJobs();
  if (cronsAreEnabled()) {
    return crons;
  }

  const disabledCrons = new Proxy(crons, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function" || !cronRegistrationMethods.has(property)) {
        return value;
      }
      return () => undefined;
    },
  });

  return disabledCrons;
}
