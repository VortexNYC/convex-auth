import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// The app owns root HTTP routing so we can serve directory indexes for the
// static MPA docs site. See convex/http.ts.
const app = defineApp();
app.use(staticHosting);

export default app;
