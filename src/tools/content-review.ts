import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

/**
 * Content-review logic for the `getReviewableContent` and `runContentReview` tools.
 * Flattening is pure; `runReview` calls Claude (Haiku) and parses its JSON output
 * defensively (a parse failure is reported as a finding, never thrown).
 */

export interface ReviewableContent {
  path: string;
  type: 'page' | 'content-fragment';
  title: string;
  fields: Record<string, string>;
  rawText: string[];
}

export interface ReviewFinding {
  severity: 'error' | 'warning' | 'info';
  field: string;
  issue: string;
  suggestion: string;
}

export interface ReviewResult {
  score: number;
  findings: ReviewFinding[];
  summary: string;
}

const STRIP_PREFIXES = ['jcr:', 'cq:', 'sling:'];
const KEEP_INTERNAL = new Set(['jcr:title', 'jcr:description']);
const TEXT_LEAF_KEYS = new Set(['text', 'title', 'jcr:title', 'jcr:description']);

function shouldStrip(key: string): boolean {
  if (KEEP_INTERNAL.has(key)) return false;
  return STRIP_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Flatten a page's `.infinity.json` tree: drop JCR/CQ/Sling internals (except
 * jcr:title / jcr:description), keep all string leaves in `fields` (keyed by
 * their relative path), and collect every `text`/`title` string into `rawText`.
 */
export function flattenPage(infinityJson: any): { title: string; fields: Record<string, string>; rawText: string[] } {
  const fields: Record<string, string> = {};
  const rawText: string[] = [];

  const walk = (node: any, path: string): void => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const childPath = path ? `${path}/${key}` : key;
      if (typeof value === 'string') {
        // Strip internal string properties (sling:resourceType, jcr:primaryType, …)
        // but keep jcr:title / jcr:description and all non-internal string leaves.
        if (shouldStrip(key)) continue;
        fields[childPath] = value;
        if (TEXT_LEAF_KEYS.has(key) && value.trim().length > 0) rawText.push(value);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${childPath}[${i}]`));
      } else if (value && typeof value === 'object') {
        // Descend into child nodes regardless of name (e.g. jcr:content) so we
        // don't drop the entire content subtree just because its key is jcr:-prefixed.
        walk(value, childPath);
      }
    }
  };

  walk(infinityJson, '');
  const title = infinityJson?.['jcr:content']?.['jcr:title'] ?? infinityJson?.['jcr:title'] ?? '';
  return { title, fields, rawText };
}

/**
 * Extract content-fragment elements from an Assets HTTP API `.json` payload.
 * Looks in the likely locations and returns a field map + raw text values.
 */
export function extractContentFragmentFields(assetJson: any): { title: string; fields: Record<string, string>; rawText: string[] } {
  const elements =
    assetJson?.elements ??
    assetJson?.properties?.elements ??
    assetJson?.['jcr:content']?.data?.master ??
    {};

  const fields: Record<string, string> = {};
  const rawText: string[] = [];

  for (const [name, element] of Object.entries<any>(elements)) {
    const value = element && typeof element === 'object' && 'value' in element ? element.value : element;
    if (value == null) continue;
    const str = Array.isArray(value) ? value.join(', ') : String(value);
    fields[name] = str;
    if (str.trim().length > 0) rawText.push(str);
  }

  const title =
    assetJson?.properties?.['jcr:title'] ??
    assetJson?.['jcr:content']?.['jcr:title'] ??
    assetJson?.title ??
    '';
  return { title, fields, rawText };
}

// ─── LLM review ───────────────────────────────────────

const REVIEW_MODEL = 'claude-haiku-4-5-20251001'; // Haiku 4.5 — fast & cheap for review

function buildSystemPrompt(governance: Record<string, unknown>): string {
  const rules = JSON.stringify(governance, null, 2);
  return [
    'You are an AEM content reviewer. Review the supplied content against the following ruleset(s).',
    '',
    'RULESET(S):',
    rules,
    '',
    'Return ONLY valid JSON in exactly this shape, with no prose and no markdown fences:',
    '{"score": <0-100>, "findings": [{"severity": "error|warning|info", "field": "<field name or \'page\'>", "issue": "<description>", "suggestion": "<specific rewrite or fix>"}], "summary": "<one sentence overall assessment>"}',
  ].join('\n');
}

/** Strip code fences and slice to the outermost JSON object before parsing. */
function extractJson(text: string): any {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(t.slice(start, end + 1));
}

export async function runReview(
  content: ReviewableContent,
  governance: Record<string, unknown>,
  _ruleset: string,
): Promise<ReviewResult> {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Suggestion: export ANTHROPIC_API_KEY before running content review.',
    );
  }

  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const userContent = JSON.stringify(
    { path: content.path, type: content.type, title: content.title, fields: content.fields, rawText: content.rawText },
    null,
    2,
  );

  const res = await client.messages.create({
    model: REVIEW_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(governance),
    messages: [{ role: 'user', content: `Review this content:\n\n${userContent}` }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    const parsed = extractJson(text);
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch {
    // Per spec: do not throw on parse failure — wrap the raw text in an error finding.
    return {
      score: 0,
      findings: [
        {
          severity: 'error',
          field: 'page',
          issue: 'LLM review response was not valid JSON.',
          suggestion: text.slice(0, 1000),
        },
      ],
      summary: 'parse-failure',
    };
  }
}
