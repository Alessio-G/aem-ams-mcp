const APP_VERSION = process.env.npm_package_version || '1.0.0';

export const config = {
  APP_VERSION,
  MCP_USERNAME: process.env.MCP_USERNAME || '',
  MCP_PASSWORD: process.env.MCP_PASSWORD || '',
  MCP_PORT: parseInt(process.env.MCP_PORT || '8502', 10),
  // Content review & design tokens (added on top of the upstream config)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  FIGMA_ACCESS_TOKEN: process.env.FIGMA_ACCESS_TOKEN || '',
  FIGMA_FILE_KEY: process.env.FIGMA_FILE_KEY || '',
  AEM_TOKENS_CLIENTLIB_PATH: process.env.AEM_TOKENS_CLIENTLIB_PATH || '',
  AEM_GOVERNANCE_PATH: process.env.AEM_GOVERNANCE_PATH || '',
}
