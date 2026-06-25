import { readFile } from 'node:fs/promises';
import { config } from '../config.js';

/**
 * Design-token logic for the `fetchDesignTokens`, `transformTokensToCss` and
 * `diffTokens` tools. The Figma fetch and local-file read are the only I/O here;
 * the CSS transform and diff are pure functions.
 */

export interface TokenEntry {
  name: string;
  value: string | number | boolean;
  type: 'color' | 'number' | 'string';
  collection: string;
}

export interface DiffResult {
  added: string[];
  removed: string[];
  changed: { name: string; from: string; to: string }[];
  unchanged: number;
}

// ─── Figma ────────────────────────────────────────────

const FIGMA_VARIABLES_URL = (fileKey: string) =>
  `https://api.figma.com/v1/files/${fileKey}/variables/local`;

function figmaTypeToTokenType(resolvedType: string): TokenEntry['type'] {
  switch (resolvedType) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'number';
    default:
      return 'string';
  }
}

function figmaColorToCss(c: { r: number; g: number; b: number; a?: number }): string {
  const to255 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
  const r = to255(c.r), g = to255(c.g), b = to255(c.b);
  const a = c.a ?? 1;
  if (a >= 1) {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function normalizeFigmaValue(value: any, resolvedType: string): string | number | boolean {
  if (value && typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
    return figmaColorToCss(value);
  }
  if (resolvedType === 'FLOAT' && typeof value === 'number') return value;
  if (resolvedType === 'BOOLEAN' && typeof value === 'boolean') return value;
  return String(value);
}

function isAlias(value: any): value is { type: 'VARIABLE_ALIAS'; id: string } {
  return Boolean(value) && typeof value === 'object' && value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string';
}

/**
 * Fetch Figma local variables and map them to W3C-style token entries.
 * Aliases (a variable whose value references another variable) are resolved one
 * level deep against the referenced variable's default-mode value.
 */
export async function fetchFigmaTokens(): Promise<TokenEntry[]> {
  const fileKey = config.FIGMA_FILE_KEY;
  const accessToken = config.FIGMA_ACCESS_TOKEN;
  if (!fileKey || !accessToken) {
    throw new Error(
      'Figma is not configured. Suggestion: set FIGMA_FILE_KEY and FIGMA_ACCESS_TOKEN, or use source="file".',
    );
  }

  const res = await fetch(FIGMA_VARIABLES_URL(fileKey), {
    headers: { 'X-FIGMA-TOKEN': accessToken },
  });
  if (!res.ok) {
    throw new Error(
      `Figma Variables API returned ${res.status}. Suggestion: verify FIGMA_FILE_KEY and that FIGMA_ACCESS_TOKEN has file_variables:read scope.`,
    );
  }

  const json: any = await res.json();
  const variables: Record<string, any> = json?.meta?.variables ?? {};
  const collections: Record<string, any> = json?.meta?.variableCollections ?? {};

  const defaultModeOf = (collectionId: string): string | undefined => {
    const col = collections[collectionId];
    return col?.defaultModeId ?? col?.modes?.[0]?.modeId;
  };
  const valueForVariable = (variable: any): any => {
    const modeId = defaultModeOf(variable.variableCollectionId);
    const byMode = variable.valuesByMode ?? {};
    return modeId !== undefined ? byMode[modeId] : Object.values(byMode)[0];
  };

  return Object.values(variables).map((variable: any) => {
    let raw = valueForVariable(variable);
    let resolvedType: string = variable.resolvedType;

    // Resolve one level of aliasing.
    if (isAlias(raw)) {
      const target = variables[raw.id];
      if (target) {
        raw = valueForVariable(target);
        resolvedType = target.resolvedType ?? resolvedType;
      }
    }

    return {
      name: variable.name,
      value: normalizeFigmaValue(raw, resolvedType),
      type: figmaTypeToTokenType(resolvedType),
      collection: collections[variable.variableCollectionId]?.name ?? 'default',
    };
  });
}

/** Read and parse a local token JSON file (array of token entries). */
export async function readTokenFile(filePath: string): Promise<TokenEntry[]> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Token file ${filePath} must contain a JSON array of tokens. Suggestion: export an array of { name, value, type, collection } entries.`,
    );
  }
  return parsed as TokenEntry[];
}

// ─── CSS transform (pure) ─────────────────────────────

/** `color/brand/Primary` → `color-brand-primary` */
export function toKebabCase(name: string): string {
  return name
    .replace(/[\s/_.]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function transformTokensToCss(
  tokens: TokenEntry[],
  prefix = '--',
  scope = ':root',
): { css: string; variableCount: number; preview: string } {
  const lines = tokens.map((t) => `  ${prefix}${toKebabCase(t.name)}: ${String(t.value)};`);
  const css = `${scope} {\n${lines.join('\n')}\n}\n`;
  const preview = lines.slice(0, 5).join('\n');
  return { css, variableCount: lines.length, preview };
}

// ─── CSS diff (pure) ──────────────────────────────────

/** Parse a CSS string into a Map of `--variable-name` → value (no trailing `;`). */
export function parseCssVariables(css: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!css) return map;
  const re = /(--[\w-]+)\s*:\s*([^;]+);/;
  for (const line of css.split('\n')) {
    const m = line.match(re);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

export function computeTokenDiff(incomingCss: string, currentCss: string): DiffResult {
  const incoming = parseCssVariables(incomingCss);
  const current = parseCssVariables(currentCss);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: { name: string; from: string; to: string }[] = [];
  let unchanged = 0;

  for (const [name, to] of incoming) {
    if (!current.has(name)) {
      added.push(name);
    } else if (current.get(name) !== to) {
      changed.push({ name, from: current.get(name)!, to });
    } else {
      unchanged += 1;
    }
  }
  for (const name of current.keys()) {
    if (!incoming.has(name)) removed.push(name);
  }

  return { added, removed, changed, unchanged };
}
