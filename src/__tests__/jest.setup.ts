// Env vars consumed by config.ts at module load — set before any module imports.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';
process.env.AEM_GOVERNANCE_PATH = '/conf/myproject/governance';
process.env.AEM_TOKENS_CLIENTLIB_PATH = '/apps/myproject/clientlibs/tokens/css/tokens.css';
process.env.FIGMA_FILE_KEY = 'FILEKEY123';
process.env.FIGMA_ACCESS_TOKEN = 'figd_test_token';
