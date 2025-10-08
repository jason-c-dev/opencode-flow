/**
 * OpenCode Swarm - Multi-agent orchestration framework
 * 
 * Main entry point for programmatic usage
 */

export * from './core/types.js';
export { OpencodeSwarm } from './core/swarm.js';
export { SwarmClient } from './core/client.js';
export { AgentManager } from './core/agent-manager.js';
export { ModelRouter } from './router/optimizer.js';

// Re-export for convenience
export type {
  SwarmConfig,
  AgentConfig,
  AgentInstance,
  TaskExecution,
  ExecutionResult,
  ModelRouterConfig,
  ModelSelection,
  SwarmMemory,
  CostAnalytics,
} from './core/types.js';
