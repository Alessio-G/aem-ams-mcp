import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AEMConnector } from '../aem/aem.connector.js';

type FakeFetch = {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  postRaw: jest.Mock;
};

function makeFakeFetch(): FakeFetch {
  return {
    get: jest.fn(),
    post: jest.fn().mockResolvedValue({}),
    put: jest.fn().mockResolvedValue({}),
    postRaw: jest.fn().mockResolvedValue({ ok: true, status: 200 }),
  };
}

function makeConnector(fetchMock: FakeFetch): AEMConnector {
  const c = new AEMConnector({ host: 'http://localhost:4502', user: 'admin', pass: 'admin' });
  (c as any).fetch = fetchMock;
  c.isInitialized = true;
  return c;
}

const TOKENS = [
  { name: 'color/brand/Primary', value: '#ff0000', type: 'color', collection: 'Brand' },
  { name: 'spacing/Large', value: 24, type: 'number', collection: 'Spacing' },
];

describe('fetchDesignTokens', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'tokens-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('happy path: reads and parses a local token JSON file', async () => {
    const filePath = join(dir, 'tokens.json');
    writeFileSync(filePath, JSON.stringify(TOKENS), 'utf-8');
    const connector = makeConnector(makeFakeFetch());

    const result: any = await connector.fetchDesignTokens({ source: 'file', filePath });

    expect(result.source).toBe('file');
    expect(result.count).toBe(2);
    expect(result.tokens[0].name).toBe('color/brand/Primary');
  });

  it('error path: source="file" without filePath throws with a suggestion', async () => {
    const connector = makeConnector(makeFakeFetch());
    await expect(connector.fetchDesignTokens({ source: 'file' })).rejects.toThrow(/filePath is required/);
  });
});

describe('transformTokensToCss', () => {
  it('happy path: kebab-cases names, applies prefix and scope', async () => {
    const connector = makeConnector(makeFakeFetch());
    const result: any = await connector.transformTokensToCss({ tokens: TOKENS as any, prefix: '--', scope: ':root' });

    expect(result.variableCount).toBe(2);
    expect(result.css).toContain('--color-brand-primary: #ff0000;');
    expect(result.css).toContain('--spacing-large: 24;');
    expect(result.css.startsWith(':root {')).toBe(true);
  });

  it('error/edge path: an empty token array yields zero variables', async () => {
    const connector = makeConnector(makeFakeFetch());
    const result: any = await connector.transformTokensToCss({ tokens: [] });
    expect(result.variableCount).toBe(0);
  });
});

describe('diffTokens', () => {
  it('happy path: computes added / changed / removed / unchanged vs the current clientlib', async () => {
    const fetchMock = makeFakeFetch();
    const currentCss = ':root {\n  --color-brand-primary: #00ff00;\n  --legacy: 1px;\n}';
    fetchMock.get.mockResolvedValue(currentCss);
    const connector = makeConnector(fetchMock);

    const incomingCss = ':root {\n  --color-brand-primary: #ff0000;\n  --spacing-large: 24;\n}';
    const result = await connector.diffTokens({ incomingCss });

    expect(result.added).toContain('--spacing-large');
    expect(result.removed).toContain('--legacy');
    expect(result.changed).toEqual([{ name: '--color-brand-primary', from: '#00ff00', to: '#ff0000' }]);
    expect(result.unchanged).toBe(0);
  });

  it('error path: a 404 on the current clientlib is treated as empty (all incoming added)', async () => {
    const fetchMock = makeFakeFetch();
    fetchMock.get.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    const connector = makeConnector(fetchMock);

    const result = await connector.diffTokens({ incomingCss: ':root {\n  --a: 1;\n  --b: 2;\n}' });
    expect(result.added).toEqual(expect.arrayContaining(['--a', '--b']));
    expect(result.removed).toEqual([]);
  });
});

describe('writeTokensToClientlib', () => {
  it('happy path: dryRun returns wouldWrite without writing', async () => {
    const fetchMock = makeFakeFetch();
    const connector = makeConnector(fetchMock);
    const css = ':root {\n  --a: 1;\n}';

    const result: any = await connector.writeTokensToClientlib({ css, dryRun: true });

    expect(result.wouldWrite.path).toBe('/apps/myproject/clientlibs/tokens/css/tokens.css');
    expect(result.wouldWrite.byteLength).toBe(css.length);
    expect(fetchMock.postRaw).not.toHaveBeenCalled();
  });

  it('error path: a non-OK Sling response throws with a suggestion', async () => {
    const fetchMock = makeFakeFetch();
    fetchMock.postRaw.mockResolvedValue({ ok: false, status: 500 });
    const connector = makeConnector(fetchMock);

    await expect(
      connector.writeTokensToClientlib({ css: ':root {}', dryRun: false }),
    ).rejects.toThrow(/Failed to write tokens clientlib/);
  });
});
