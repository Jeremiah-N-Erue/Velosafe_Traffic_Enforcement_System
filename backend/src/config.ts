import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  databasePath: process.env.DATABASE_PATH ?? "./data/velosafe.db",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
