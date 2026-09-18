import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval("process webhook queue", { minutes: 1 }, api.webhooks.processWebhookQueue, {
  limit: 10,
});

export default crons;
