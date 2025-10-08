/**
 * OpenCode Flow - Multi-agent orchestration framework
 * 
 * Main entry point for programmatic usage
 */

export * from './core/types.js';
export { OpencodeFlow } from './core/flow.js';
export { FlowClient } from './core/client.js';
export { AgentManager } from './core/agent-manager.js';
export { ModelRouter } from './router/optimizer.js';

// Re-export for convenience
export type {
  FlowConfig,
  AgentConfig,
  AgentInstance,
  TaskExecution,
  ExecutionResult,
  ModelRouterConfig,
  ModelSelection,
  FlowMemory,
  CostAnalytics,
} from './core/types.js';
