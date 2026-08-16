import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

export interface EvidenceInput {
  data: string; // base64, optionally prefixed with a data: URL header
  mime_type: string;
}

export interface SavedEvidence {
  filePath: string; // relative path, safe to store in the DB
  mimeType: string;
  fileHash: string; // sha256 hex digest, for tamper-evidence
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/**
 * Decodes a base64 evidence payload and writes it to local disk, returning the
 * relative path + a SHA-256 hash of the bytes (simple tamper-evidence: if the
 * stored file is ever altered later, its hash won't match what's on record).
 *
 * NOTE: this is local-disk storage, which is ephemeral on the current free-tier
 * hosting (accepted trade-off for this prototype phase — see v2 roadmap doc).
 * Swapping this for real object storage (S3, etc.) later only requires changing
 * this one module, not any of its callers.
 */
export function saveEvidenceFile(input: EvidenceInput): SavedEvidence {
  const raw = input.data.includes(",") && input.data.startsWith("data:")
    ? input.data.slice(input.data.indexOf(",") + 1)
    : input.data;

  const buffer = Buffer.from(raw, "base64");
  if (buffer.length === 0) {
    throw new Error("Evidence file is empty or not valid base64 data");
  }
  // Generous but bounded — this is demo/prototype infrastructure on local disk.
  const MAX_BYTES = 15 * 1024 * 1024; // 15MB
  if (buffer.length > MAX_BYTES) {
    throw new Error("Evidence file exceeds the 15MB limit");
  }

  const ext = EXTENSIONS[input.mime_type] ?? "bin";
  const fileName = `${crypto.randomUUID()}.${ext}`;

  fs.mkdirSync(path.resolve(config.evidenceDir), { recursive: true });
  const absolutePath = path.join(path.resolve(config.evidenceDir), fileName);
  fs.writeFileSync(absolutePath, buffer);

  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    filePath: fileName, // stored relative to evidenceDir; resolved again when serving
    mimeType: input.mime_type,
    fileHash,
  };
}

export function readEvidenceFile(fileName: string): Buffer {
  const safeName = path.basename(fileName); // guard against path traversal
  const absolutePath = path.join(path.resolve(config.evidenceDir), safeName);
  return fs.readFileSync(absolutePath);
}
