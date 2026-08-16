import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { db } from "../db";
import { AuthTokenPayload, Role } from "../types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      device?: { id: number; label: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Authenticates a device (radar, lidar, speed camera, red-light camera — any vendor) via a
 * per-device API key sent in the X-Device-Key header, instead of the user JWT flow. This is the
 * vendor-agnostic ingestion contract: any hardware that can send this header and the standard
 * violation payload can submit through the API, regardless of manufacturer.
 */
export function requireDeviceAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-device-key"];
  if (!key || typeof key !== "string") {
    res.status(401).json({ error: "Missing X-Device-Key header" });
    return;
  }

  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  const device = db
    .prepare("SELECT id, label FROM devices WHERE api_key_hash = ? AND active = 1")
    .get(keyHash) as { id: number; label: string } | undefined;

  if (!device) {
    res.status(401).json({ error: "Invalid or inactive device key" });
    return;
  }

  db.prepare("UPDATE devices SET last_used_at = datetime('now') WHERE id = ?").run(device.id);
  req.device = device;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
