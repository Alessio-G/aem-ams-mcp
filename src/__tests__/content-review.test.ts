// Mock the Anthropic SDK before any module that imports it loads.
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

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
  // Override the private, real AEMFetch with our jest mock (runtime property).
  (c as any).fetch = fetchMock;
  c.isInitialized = true;
  return c;
}

const PAGE_INFINITY = {
  'jcr:primaryType': 'cq:Page',
  'jcr:content': {
    'jcr:primaryType': 'cq:PageContent',
    'jcr:title': 'Home',
    'jcr:description': 'Welcome to the site',
    'sling:resourceType': 'myproject/components/page',
    'cq:template': '/conf/myproject/settings/wcm/templates/home',
    par: {
      heading: { 'jcr:primaryType': 'nt:unstructured', title: 'Big Heading', 'sling:resourceType': 'x' },
      body: { text: 'Some body text', 'cq:lastModified': '2026-01-01' },
    },
  },
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe('getReviewableContent', () => {
  it('happy path: flattens a page, strips internals, collects rawText', async () => {
    const fetchMock = makeFakeFetch();
    fetchMock.get.mockResolvedValue(PAGE_INFINITY);
    const connector = makeConnector(fetchMock);

    const result = await connector.getReviewableContent({ path: '/content/myproject/en/home', type: 'page' });

    expect(fetchMock.get).toHaveBeenCalledWith('/content/myproject/en/home.infinity.json', undefined);
    expect(result.title).toBe('Home');
    expect(result.rawText).toEqual(expect.arrayContaining(['Home', 'Welcome to the site', 'Big Heading', 'Some body text']));
    // JCR/CQ/Sling internals must be stripped from fields.
    const fieldKeys = Object.keys(result.fields).join(' ');
    expect(fieldKeys).not.toMatch(/sling:resourceType|cq:template|cq:lastModified|jcr:primaryType/);
  });

  it('error path: rejects a JCR path outside the allowed roots', async () => {
    const connector = makeConnector(makeFakeFetch());
    await expect(
      connector.getReviewableContent({ path: '/etc/secrets', type: 'page' }),
    ).rejects.toThrow(/must start with/);
  });
});

describe('runContentReview', () => {
  it('happy path: returns parsed findings from the LLM', async () => {
    const fetchMock = makeFakeFetch();
    fetchMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('.infinity.json')) return PAGE_INFINITY;
      if (url.includes('/governance/')) return { tone: 'friendly', maxTitleLength: 60 };
      return {};
    });
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            score: 82,
            findings: [{ severity: 'warning', field: 'jcr:title', issue: 'Too long', suggestion: 'Shorten it' }],
            summary: 'Mostly on-brand.',
          }),
        },
      ],
    });
    const connector = makeConnector(fetchMock);

    const result = await connector.runContentReview({
      path: '/content/myproject/en/home',
      type: 'page',
      ruleset: 'brand-voice',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.score).toBe(82);
    expect(result.findings).toHaveLength(1);
    expect(result.summary).toBe('Mostly on-brand.');
    expect(result.ruleset).toBe('brand-voice');
  });

  it('error path: non-JSON LLM output yields a parse-failure finding (no throw)', async () => {
    const fetchMock = makeFakeFetch();
    fetchMock.get.mockImplementation(async (url: string) =>
      url.endsWith('.infinity.json') ? PAGE_INFINITY : {},
    );
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot produce JSON for this.' }] });
    const connector = makeConnector(fetchMock);

    const result = await connector.runContentReview({
      path: '/content/myproject/en/home',
      type: 'page',
      ruleset: 'all',
    });

    expect(result.score).toBe(0);
    expect(result.summary).toBe('parse-failure');
    expect(result.findings[0].severity).toBe('error');
  });
});

describe('applyReviewSuggestion', () => {
  it('happy path: writes a page field via the Sling POST servlet', async () => {
    const fetchMock = makeFakeFetch();
    const connector = makeConnector(fetchMock);

    const result: any = await connector.applyReviewSuggestion({
      path: '/content/myproject/en/home',
      type: 'page',
      field: 'jcr:title',
      value: 'New Title',
      dryRun: false,
    });

    expect(fetchMock.post).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, path: '/content/myproject/en/home', field: 'jcr:title', written: 'New Title' });
  });

  it('error path: rejects an invalid JCR path', async () => {
    const connector = makeConnector(makeFakeFetch());
    await expect(
      connector.applyReviewSuggestion({ path: '/content/../etc', type: 'page', field: 'x', value: 'y' }),
    ).rejects.toThrow(/traversal|must start with/);
  });
});
