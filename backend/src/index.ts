import express from "express";
import cors from "cors";
import { config } from "./config";
import "./db"; // runs migrations on import
import { authRouter } from "./routes/auth.routes";
import { zonesRouter } from "./routes/zones.routes";
import { vehiclesRouter } from "./routes/vehicles.routes";
import { violationsRouter } from "./routes/violations.routes";
import { incidentsRouter } from "./routes/incidents.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { chatRouter } from "./routes/chat.routes";
import { ingestRouter } from "./routes/ingest.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
// Raised from Express's 100kb default to accommodate base64-encoded evidence photos/videos
// submitted as part of the JSON body.
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "velosafe-backend", time: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head><title>VeloSafe Backend</title>
  <style>
    body { background:#0f1420; color:#e6ebf5; font-family:-apple-system,Segoe UI,Roboto,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .card { background:#161d2e; border:1px solid #2a3450; border-radius:12px; padding:32px 40px; max-width:480px; }
    h1 { margin:0 0 8px; font-size:20px; }
    p { color:#9aa5bd; font-size:14px; line-height:1.6; }
    code { background:#1e2740; padding:2px 6px; border-radius:4px; }
    a { color:#3d8bff; text-decoration:none; }
    ul { padding-left:18px; }
  </style>
  </head>
  <body>
    <div class="card">
      <h1>VeloSafe Backend API</h1>
      <p>This server is running. It's a JSON API, not a web app — the dashboard lives at
      <a href="http://localhost:5173">http://localhost:5173</a>.</p>
      <p>Endpoints:</p>
      <ul>
        <li><a href="/api/health">/api/health</a></li>
        <li><code>/api/auth</code></li>
        <li><code>/api/zones</code></li>
        <li><code>/api/vehicles</code></li>
        <li><code>/api/violations</code></li>
        <li><code>/api/incidents</code></li>
        <li><code>/api/dashboard</code></li>
        <li><code>/api/chat</code></li>
        <li><code>/api/ingest</code></li>
      </ul>
    </div>
  </body>
</html>`);
});

app.use("/api/auth", authRouter);
app.use("/api/zones", zonesRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/violations", violationsRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ingest", ingestRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`VeloSafe backend listening on http://localhost:${config.port}`);
});
