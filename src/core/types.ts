/**
 * Core type definitions for OpenCode Flow
 */

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  /** Unique agent name */
  name: string;
  /** OpenCode agent type (build, plan, general, custom) */
  agent: string;
  /** Model identifier */
  model: string;
  /** Provider (anthropic, openai, google, openrouter) */
  provider?: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Tool whitelist */
  tools?: string[];
  /** Permission overrides */
  permissions?: PermissionConfig;
  /** Temperature (0.0-1.0) */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Minimum quality score for model router (0-100) */
  minQuality?: number;
}

export interface PermissionConfig {
  edit?: Permission;
  bash?: Permission | BashPermission;
  webfetch?: Permission;
}

export type Permission = 'allow' | 'ask' | 'deny';

export interface BashPermission {
  '*'?: Permission;
  [pattern: string]: Permission | undefined;
}

// ============================================================================
// Agent Instance (Runtime State)
// ============================================================================

export interface AgentInstance {
  /** Agent name */
  name: string;
  /** OpenCode session ID */
  sessionId: string;
  /** Agent configuration */
  config: AgentConfig;
  /** Current status */
  status: AgentStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Health check interval handle */
  healthCheckInterval?: NodeJS.Timeout;
  /** Agent metrics */
  metrics?: AgentMetrics;
}

export type AgentStatus = 'idle' | 'busy' | 'error';

export interface AgentMetrics {
  tasksCompleted: number;
  totalCost: number;
  totalTokens: TokenUsage;
  averageLatency: number;
}

// ============================================================================
// Task Execution
// ============================================================================

export interface TaskExecution {
  /** Task description */
  task: string;
  /** Agent names to execute */
  agents: string[];
  /** Execution mode */
  mode?: ExecutionMode;
  /** Task timeout in milliseconds */
  timeout?: number;
  /** Retry policy */
  retryPolicy?: RetryPolicy;
  /** Model optimization mode */
  optimize?: OptimizationMode;
  /** Maximum cost per task */
  maxCostPerTask?: number;
}

export type ExecutionMode = 'parallel' | 'sequential' | 'hierarchical';

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface ExecutionResult {
  /** Agent name */
  agent: string;
  /** Execution status */
  status: 'fulfilled' | 'rejected';
  /** Output (if successful) */
  output?: any;
  /** Error (if failed) */
  error?: Error;
  /** Execution duration in milliseconds */
  duration: number;
  /** Cost in dollars */
  cost: number;
  /** Tokens used */
  tokensUsed: TokenUsage;
}

export interface TokenUsage {
  input: number;
  output: number;
}

// ============================================================================
// Model Router
// ============================================================================

export interface ModelRouterConfig {
  /** Optimization mode */
  mode: OptimizationMode;
  /** Maximum cost per task (dollars) */
  maxCostPerTask?: number;
  /** Fallback chain for errors */
  fallbackChain?: string[];
  /** Custom routing rules */
  rules?: RoutingRule[];
}

export type OptimizationMode = 'cost' | 'quality' | 'balanced' | 'speed' | 'privacy';

export interface RoutingRule {
  condition: {
    taskType?: string;
    agentType?: string;
    privacy?: 'low' | 'medium' | 'high';
    complexity?: 'simple' | 'medium' | 'complex';
  };
  action: {
    provider: string;
    model: string;
  };
  reasoning: string;
}

export interface ModelSelection {
  provider: string;
  model: string;
  reasoning: string;
  estimatedCost: number;
  qualityScore: number;
}

export interface ModelInfo {
  provider: string;
  name: string;
  costPerInputToken: number;
  costPerOutputToken: number;
  tokensPerSecond: number;
  benchmarkScores: Record<string, number>;
  capabilities?: string[];
}

// ============================================================================
// Flow Configuration
// ============================================================================

export interface FlowConfig {
  /** OpenCode server URL */
  serverUrl?: string;
  /** Model router configuration */
  modelRouter?: ModelRouterConfig;
  /** Memory backend configuration */
  memory?: MemoryConfig;
  /** Pre-configured agents */
  agents?: AgentConfig[];
  /** Default retry policy */
  retryPolicy?: RetryPolicy;
}

export interface MemoryConfig {
  /** Backend type */
  backend: 'file' | 'redis' | 'custom';
  /** Storage path (file backend) */
  path?: string;
  /** Redis URL (redis backend) */
  url?: string;
  /** Custom backend instance */
  customBackend?: MemoryBackend;
}

// ============================================================================
// Memory
// ============================================================================

export interface FlowMemory {
  set(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  clear(): Promise<void>;
}

export interface MemoryBackend {
  set(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
  clear(): Promise<void>;
}

export interface MemoryEntry {
  key: string;
  value: any;
  createdAt: number;
  expiresAt?: number;
  createdBy: string;
}

// ============================================================================
// OpenCode API Types (from SDK)
// ============================================================================

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  parentID?: string;
}

export interface Message {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface MessageInput {
  text: string;
  providerID?: string;
  modelID?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Provider {
  id: string;
  name: string;
  models: Model[];
}

export interface Model {
  id: string;
  name: string;
  description?: string;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface ClientConfig {
  /** OpenCode server base URL */
  baseUrl: string;
  /** Request timeout */
  timeout?: number;
  /** Retry policy */
  retryPolicy?: RetryPolicy;
  /** Connection pool size */
  poolSize?: number;
}

// ============================================================================
// Analytics
// ============================================================================

export interface CostAnalytics {
  totalCost: number;
  costByModel: Record<string, number>;
  costByAgent: Record<string, number>;
  tokenUsage: TokenUsage;
  requestCount: number;
  averageCostPerRequest: number;
}

// ============================================================================
// Errors
// ============================================================================

export class FlowError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FlowError';
  }
}

export class AgentSpawnError extends FlowError {
  constructor(agentName: string, cause: Error) {
    super(
      `Failed to spawn agent: ${agentName}`,
      'AGENT_SPAWN_FAILED',
      { agentName, cause }
    );
    this.name = 'AgentSpawnError';
  }
}

export class TaskExecutionError extends FlowError {
  constructor(task: string, agent: string, cause: Error) {
    super(
      `Task execution failed: ${task}`,
      'TASK_FAILED',
      { task, agent, cause }
    );
    this.name = 'TaskExecutionError';
  }
}

export class ModelSelectionError extends FlowError {
  constructor(reason: string) {
    super(
      `Model selection failed: ${reason}`,
      'MODEL_SELECTION_FAILED',
      { reason }
    );
    this.name = 'ModelSelectionError';
  }
}

// ============================================================================
// Events
// ============================================================================

export type FlowEvent =
  | { type: 'agent:spawned'; agent: AgentInstance }
  | { type: 'agent:terminated'; agentName: string }
  | { type: 'task:started'; task: string; agents: string[] }
  | { type: 'task:completed'; results: ExecutionResult[] }
  | { type: 'task:failed'; error: Error }
  | { type: 'memory:set'; key: string; value: any }
  | { type: 'memory:get'; key: string; value: any };

export type EventHandler = (event: FlowEvent) => void;
export type Unsubscribe = () => void;
