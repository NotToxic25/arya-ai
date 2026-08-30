/**
 * ai/index.js
 * Factory for selecting a provider by name from config, so switching
 * providers never requires touching orchestration code (Phase 2
 * acceptance criterion: "provider switching capability").
 */
import { ConfigError } from '../core/errors.js';
import { MockProvider } from './providers/mockProvider.js';
import { ProxyProvider } from './providers/proxyProvider.js';

export { AIProvider } from './AIProvider.js';
export { ConversationContext } from './ConversationContext.js';
export { ToolRegistry, toolRegistry } from './toolRegistry.js';
export { Orchestrator } from './orchestrator.js';

/**
 * @param {string} providerName - 'mock' | 'proxy'
 * @param {Object} [providerConfig]
 * @returns {import('./AIProvider.js').AIProvider}
 */
export function getProvider(providerName, providerConfig = {}) {
  switch (providerName) {
    case 'mock':
      return new MockProvider();
    case 'proxy':
      return new ProxyProvider(providerConfig);
    default:
      throw new ConfigError(`Unknown AI provider "${providerName}". Valid options: "mock", "proxy".`);
  }
}

export default getProvider;
