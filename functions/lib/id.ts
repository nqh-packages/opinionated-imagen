/**
 * UUID v4 generator.
 * Uses crypto.randomUUID() available via nodejs_compat in Workers.
 */

export function generateId(): string {
  return crypto.randomUUID();
}
