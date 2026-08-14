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
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "velosafe-backend", time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/zones", zonesRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/violations", violationsRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/chat", chatRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`VeloSafe backend listening on http://localhost:${config.port}`);
});
