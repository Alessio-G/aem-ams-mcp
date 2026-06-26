/**
 * Shared JCR path validation for the content-review and design-token tools.
 *
 * Security rules (applied to every tool parameter that accepts a JCR path):
 *   1. Reject any path containing `..` (traversal).
 *   2. Reject any path that does not start with `/content`, `/conf`, or `/apps/myproject`.
 *
 * Throws a descriptive Error (with a `Suggestion:` clause) on violation so the
 * MCP server's CallTool error wrapper surfaces actionable guidance to the LLM.
 */

const ALLOWED_PREFIXES = ['/content', '/conf', '/apps/myproject'] as const;

export function validateJcrPath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(
      `Invalid JCR path: a non-empty string is required. Suggestion: pass an absolute JCR path under ${ALLOWED_PREFIXES.join(', ')}.`,
    );
  }
  if (path.includes('..')) {
    throw new Error(
      `Invalid JCR path "${path}": path traversal ("..") is not allowed. Suggestion: pass an absolute JCR path with no ".." segments.`,
    );
  }
  if (!ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    throw new Error(
      `Invalid JCR path "${path}": must start with ${ALLOWED_PREFIXES.join(', ')}. Suggestion: scope the path to one of those roots (e.g. /content/myproject/en/home).`,
    );
  }
}

/**
 * Zod `.refine()` predicate — returns false on any validation failure so the
 * schema rejects the input. Pair with `JCR_PATH_REFINE_MESSAGE` for the error text.
 */
export function isValidJcrPath(path: string): boolean {
  try {
    validateJcrPath(path);
    return true;
  } catch {
    return false;
  }
}

export const JCR_PATH_REFINE_MESSAGE =
  `Invalid JCR path: must start with ${ALLOWED_PREFIXES.join(', ')} and contain no ".." segments.`;
