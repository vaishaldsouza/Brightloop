import crypto from "crypto";

/**
 * Computes a SHA-256 hash of a raw token for secure database storage.
 * The raw token is delivered to the authorized user once;
 * the database stores exclusively the one-way cryptographic hash.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates a cryptographically secure random token (32 bytes / 64 hex characters).
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
