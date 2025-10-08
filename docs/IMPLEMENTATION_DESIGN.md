# OpenCode Swarm - Implementation Design

**Version:** 1.0.0  
**Last Updated:** October 2025

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Components](#core-components)
3. [Data Models](#data-models)
4. [API Specifications](#api-specifications)
5. [Module Dependencies](#module-dependencies)
6. [Error Handling](#error-handling)
7. [Testing Strategy](#testing-strategy)
8. [Performance Considerations](#performance-considerations)

---

## System Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                      │
│  CLI Interface, HTTP Server, SDK Exports                    │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  SwarmOrchestrator, TaskDistributor, ResultAggregator       │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Business Layer                         │
│  ModelRouter, AgentManager, MemoryCoordinator               │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Integration Layer                      │
│  SwarmClient (OpenCode API), MCP Tools, Providers           │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
opencode-swarm/
├── src/
│   ├── core/
│   │   ├── client.ts              # OpenCode HTTP client wrapper
│   │   ├── swarm.ts               # Main orchestrator
│   │   ├── agent-manager.ts       # Agent lifecycle management
│   │   └── types.ts               # Core type definitions
│   ├── router/
│   │   ├── optimizer.ts           # Model selection logic
│   │   ├── cost-tracker.ts        # Usage & cost tracking
│   │   ├── providers.ts           # Provider configurations
│   │   └── fallback.ts            # Fallback chain handler
│   ├── agents/
│   │   ├── definitions/
│   │   │   ├── researcher.ts      # Researcher agent config
│   │   │   ├── coder.ts           # Coder agent config
│   │   │   ├── reviewer.ts        # Code reviewer config
│   │   │   └── tester.ts          # Testing agent config
│   │   └── registry.ts            # Agent registry/loader
│   ├── tools/
│   │   ├── swarm-memory.ts        # Custom MCP tool
│   │   ├── memory-backend.ts      # Storage abstraction
│   │   └── coordination.ts        # Cross-agent coordination
│   ├── cli/
│   │   ├── index.ts               # CLI entry point
│   │   ├── commands.ts            # Command definitions
│   │   └── ui.ts                  # Terminal UI helpers
│   ├── server/
│   │   ├── index.ts               # HTTP server for swarm API
│   │   └── routes.ts              # API routes
│   └── utils/
│       ├── logger.ts              # Structured logging
│       ├── config.ts              # Configuration management
│       └── errors.ts              # Custom error types
├── tools/                          # MCP tool implementations
│   └── swarm-memory/
│       ├── index.ts
│       └── package.json
├── examples/
│   ├── code-review-swarm.ts
│   ├── api-generator-swarm.ts
│   └── security-audit-swarm.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── PROJECT_SPEC.md
│   ├── IMPLEMENTATION_DESIGN.md  # This file
│   ├── API_REFERENCE.md
│   └── DEPLOYMENT_GUIDE.md
├── deployment/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── kubernetes/
│       ├── deployment.yaml
│       └── service.yaml
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## Core Components

### 1. SwarmClient (`src/core/client.ts`)

**Purpose:** Wrapper around OpenCode HTTP API with retry logic and error handling.

**Interface:**
```typescript
class SwarmClient {
  constructor(config: ClientConfig);
  
  // Session management
  async createSession(options: SessionOptions): Promise<Session>;
  async getSession(id: string): Promise<Session>;
  async deleteSession(id: string): Promise<void>;
  async listSessions(): Promise<Session[]>;
  
  // Messaging
  async sendMessage(sessionId: string, message: MessageInput): Promise<Message>;
  async streamMessage(sessionId: string, message: MessageInput): AsyncIterator<MessagePart>;
  
  // Configuration
  async getAgents(): Promise<Agent[]>;
  async getProviders(): Promise<Provider[]>;
  
  // Events
  subscribeToEvents(handler: EventHandler): Unsubscribe;
}
```

**Implementation Details:**
- Uses `fetch` with retry logic (exponential backoff)
- Server-sent events for streaming
- Connection pooling for multiple sessions
- Automatic reconnection on disconnect

---

### 2. SwarmOrchestrator (`src/core/swarm.ts`)

**Purpose:** Main coordination layer for multi-agent execution.

**Interface:**
```typescript
class SwarmOrchestrator {
  constructor(config: SwarmConfig);
  
  // Agent lifecycle
  async spawn(agentConfig: AgentConfig): Promise<AgentInstance>;
  async terminate(agentName: string): Promise<void>;
  async terminateAll(): Promise<void>;
  
  // Task execution
  async execute(task: TaskExecution): Promise<ExecutionResult[]>;
  async executeParallel(task: string, agents: string[]): Promise<ExecutionResult[]>;
  async executeSequential(task: string, agents: string[]): Promise<ExecutionResult[]>;
  async executeHierarchical(task: string, coordinator: string, workers: string[]): Promise<ExecutionResult>;
  
  // Memory & coordination
  get memory(): SwarmMemory;
  async waitForAgent(agentName: string): Promise<void>;
  
  // Lifecycle
  async shutdown(): Promise<void>;
}
```

**Key Algorithms:**

**Parallel Execution:**
```typescript
async executeParallel(task: string, agents: string[]): Promise<ExecutionResult[]> {
  // 1. Route task to optimal models for each agent
  const routedAgents = await Promise.all(
    agents.map(async (name) => {
      const agent = this.agents.get(name);
      const model = await this.router.selectModel(task, agent.config);
      return { ...agent, model };
    })
  );
  
  // 2. Send tasks in parallel
  const promises = routedAgents.map((agent) =>
    this.client.sendMessage(agent.sessionId, {
      text: task,
      providerID: agent.model.provider,
      modelID: agent.model.model
    })
  );
  
  // 3. Collect results with timeout
  const results = await Promise.allSettled(promises);
  
  // 4. Process results
  return results.map((result, idx) => ({
    agent: agents[idx],
    status: result.status,
    output: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  }));
}
```

**Sequential Execution:**
```typescript
async executeSequential(task: string, agents: string[]): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  let context = task;
  
  for (const agentName of agents) {
    const agent = this.agents.get(agentName);
    
    // Augment context with previous results
    const augmentedTask = results.length > 0
      ? `${context}\n\nPrevious results:\n${this.formatResults(results)}`
      : context;
    
    // Execute
    const result = await this.client.sendMessage(agent.sessionId, {
      text: augmentedTask
    });
    
    results.push({
      agent: agentName,
      status: 'fulfilled',
      output: result
    });
    
    // Store in shared memory for other agents
    await this.memory.set(`${agentName}_result`, result);
  }
  
  return results;
}
```

---

### 3. ModelRouter (`src/router/optimizer.ts`)

**Purpose:** Cost-optimized model selection based on task requirements.

**Interface:**
```typescript
class ModelRouter {
  constructor(config: ModelRouterConfig);
  
  async selectModel(task: string, agentConfig: AgentConfig): Promise<ModelSelection>;
  async getFallbackModel(primary: string, error: Error): Promise<ModelSelection>;
  trackUsage(model: string, tokens: TokenUsage): void;
  getCostAnalytics(): CostAnalytics;
}

interface ModelSelection {
  provider: string;
  model: string;
  reasoning: string;
  estimatedCost: number;
  qualityScore: number;
}
```

**Model Scoring Algorithm:**
```typescript
async selectModel(task: string, agentConfig: AgentConfig): Promise<ModelSelection> {
  // 1. Get available models for this agent's provider
  const models = this.getAvailableModels(agentConfig.provider);
  
  // 2. Score each model based on mode (cost/quality/balanced)
  const scored = models.map(model => ({
    model,
    score: this.calculateScore(model, task, this.config.mode)
  }));
  
  // 3. Apply constraints (max cost, min quality)
  const viable = scored.filter(s => 
    s.score.cost <= (this.config.maxCostPerTask || Infinity) &&
    s.score.quality >= (agentConfig.minQuality || 0)
  );
  
  // 4. Select best match
  const best = viable.sort((a, b) => b.score.total - a.score.total)[0];
  
  return {
    provider: best.model.provider,
    model: best.model.name,
    reasoning: this.explainSelection(best),
    estimatedCost: best.score.cost,
    qualityScore: best.score.quality
  };
}

calculateScore(model: ModelInfo, task: string, mode: OptimizationMode): Score {
  const weights = this.getWeights(mode);
  
  // Cost score (inverse - lower cost = higher score)
  const costScore = 100 - (model.costPerToken * 10000);
  
  // Quality score (from benchmark data)
  const qualityScore = model.benchmarkScores[this.getTaskType(task)] || 50;
  
  // Speed score (tokens/sec)
  const speedScore = Math.min(100, model.tokensPerSecond);
  
  // Weighted total
  const total = 
    (costScore * weights.cost) +
    (qualityScore * weights.quality) +
    (speedScore * weights.speed);
  
  return { total, cost: costScore, quality: qualityScore, speed: speedScore };
}
```

**Provider Database (ported from agentic-flow):**
```typescript
const MODELS: ModelInfo[] = [
  {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    tokensPerSecond: 50,
    benchmarkScores: {
      'code-generation': 95,
      'code-review': 92,
      'research': 90,
      'testing': 88
    }
  },
  {
    provider: 'openrouter',
    name: 'deepseek/deepseek-r1',
    costPerInputToken: 0.00000055,
    costPerOutputToken: 0.00000219,
    tokensPerSecond: 45,
    benchmarkScores: {
      'code-generation': 90,
      'code-review': 90,
      'research': 85,
      'testing': 87
    }
  },
  {
    provider: 'google',
    name: 'gemini-2.5-flash',
    costPerInputToken: 0.000000075,
    costPerOutputToken: 0.0000003,
    tokensPerSecond: 80,
    benchmarkScores: {
      'code-generation': 78,
      'code-review': 75,
      'research': 82,
      'testing': 76
    }
  }
  // ... more models
];
```

---

### 4. SwarmMemory (`src/tools/swarm-memory.ts`)

**Purpose:** Cross-agent shared memory via custom MCP tool.

**MCP Tool Implementation:**
```typescript
// tools/swarm-memory/index.ts
import { tool } from '@opencode-ai/plugin';
import { MemoryBackend } from './backend';

const backend = new MemoryBackend();

export const swarm_memory_set = tool({
  description: 'Store data in swarm shared memory',
  args: {
    key: tool.schema.string().describe('Memory key'),
    value: tool.schema.any().describe('Value to store'),
    ttl: tool.schema.number().optional().describe('TTL in seconds')
  },
  async execute(args, context) {
    await backend.set(args.key, args.value, args.ttl);
    return `Stored: ${args.key}`;
  }
});

export const swarm_memory_get = tool({
  description: 'Retrieve data from swarm shared memory',
  args: {
    key: tool.schema.string().describe('Memory key')
  },
  async execute(args, context) {
    const value = await backend.get(args.key);
    return value || null;
  }
});

export const swarm_memory_list = tool({
  description: 'List all keys in swarm memory',
  args: {},
  async execute(args, context) {
    return await backend.listKeys();
  }
});

export const swarm_memory_delete = tool({
  description: 'Delete key from swarm memory',
  args: {
    key: tool.schema.string().describe('Memory key')
  },
  async execute(args, context) {
    await backend.delete(args.key);
    return `Deleted: ${args.key}`;
  }
});
```

**Memory Backend (pluggable storage):**
```typescript
// File-based (default)
class FileBackend implements MemoryBackend {
  private storePath = './.swarm-memory';
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const data = { value, expiresAt: ttl ? Date.now() + ttl * 1000 : null };
    await fs.writeFile(`${this.storePath}/${key}.json`, JSON.stringify(data));
  }
  
  async get(key: string): Promise<any> {
    const data = JSON.parse(await fs.readFile(`${this.storePath}/${key}.json`));
    if (data.expiresAt && Date.now() > data.expiresAt) {
      await this.delete(key);
      return null;
    }
    return data.value;
  }
}

// Redis backend (for production)
class RedisBackend implements MemoryBackend {
  private client: RedisClient;
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client.setEx(key, ttl, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }
  
  async get(key: string): Promise<any> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }
}
```

---

### 5. AgentManager (`src/core/agent-manager.ts`)

**Purpose:** Manages agent lifecycle, health checks, and cleanup.

**Interface:**
```typescript
class AgentManager {
  private agents = new Map<string, AgentInstance>();
  private client: SwarmClient;
  
  async spawn(config: AgentConfig): Promise<AgentInstance> {
    // 1. Validate config
    this.validateConfig(config);
    
    // 2. Create OpenCode session
    const session = await this.client.createSession({
      title: `${config.name}-${Date.now()}`
    });
    
    // 3. Configure agent (send initial system prompt)
    if (config.systemPrompt) {
      await this.client.sendMessage(session.id, {
        text: config.systemPrompt,
        providerID: config.provider,
        modelID: config.model
      });
    }
    
    // 4. Create agent instance
    const agent: AgentInstance = {
      name: config.name,
      sessionId: session.id,
      config,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
    this.agents.set(config.name, agent);
    
    // 5. Setup health check
    this.startHealthCheck(agent);
    
    return agent;
  }
  
  async terminate(name: string): Promise<void> {
    const agent = this.agents.get(name);
    if (!agent) throw new Error(`Agent not found: ${name}`);
    
    // Stop health check
    this.stopHealthCheck(agent);
    
    // Delete session
    await this.client.deleteSession(agent.sessionId);
    
    // Remove from registry
    this.agents.delete(name);
  }
  
  private startHealthCheck(agent: AgentInstance): void {
    const interval = setInterval(async () => {
      try {
        await this.client.getSession(agent.sessionId);
        agent.lastActivity = Date.now();
      } catch (error) {
        console.error(`Health check failed for ${agent.name}:`, error);
        // Auto-cleanup after 3 failed checks
        if (Date.now() - agent.lastActivity > 30000) {
          await this.terminate(agent.name);
        }
      }
    }, 10000); // Check every 10s
    
    agent.healthCheckInterval = interval;
  }
}
```

---

## Data Models

### Core Types

```typescript
// Agent Configuration
interface AgentConfig {
  name: string;
  agent: string;                    // OpenCode agent type
  provider: string;                 // anthropic, openai, etc.
  model: string;                    // Model identifier
  systemPrompt?: string;
  tools?: string[];                 // Tool whitelist
  permissions?: PermissionConfig;
  temperature?: number;
  maxTokens?: number;
  minQuality?: number;              // For model router
}

// Agent Instance (runtime state)
interface AgentInstance {
  name: string;
  sessionId: string;
  config: AgentConfig;
  status: 'idle' | 'busy' | 'error';
  createdAt: number;
  lastActivity: number;
  healthCheckInterval?: NodeJS.Timeout;
  metrics?: AgentMetrics;
}

// Task Execution
interface TaskExecution {
  task: string;
  agents: string[];
  mode: 'parallel' | 'sequential' | 'hierarchical';
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

// Execution Result
interface ExecutionResult {
  agent: string;
  status: 'fulfilled' | 'rejected';
  output?: Message;
  error?: Error;
  duration: number;
  cost: number;
  tokensUsed: TokenUsage;
}

// Model Router
interface ModelRouterConfig {
  mode: 'cost' | 'quality' | 'balanced' | 'speed';
  maxCostPerTask?: number;
  fallbackChain?: string[];
  rules?: RoutingRule[];
}

interface RoutingRule {
  condition: {
    taskType?: string;
    agentType?: string;
    privacy?: 'low' | 'medium' | 'high';
  };
  action: {
    provider: string;
    model: string;
  };
  reasoning: string;
}

// Memory
interface MemoryEntry {
  key: string;
  value: any;
  createdAt: number;
  expiresAt?: number;
  createdBy: string;  // Agent name
}
```

---

## API Specifications

### CLI Commands

```bash
# Spawn agents
opencode-swarm spawn --agent researcher --model gemini-2.5-flash
opencode-swarm spawn --agent coder --model claude-sonnet-4

# Execute task
opencode-swarm exec --task "Build REST API" --agents researcher,coder

# With optimization
opencode-swarm exec \
  --task "Code review" \
  --agents reviewer \
  --optimize cost \
  --max-cost 0.01

# List active agents
opencode-swarm list

# Terminate agent
opencode-swarm terminate researcher

# Shutdown all
opencode-swarm shutdown

# Server mode
opencode-swarm serve --port 5000
```

### HTTP API (Server Mode)

```typescript
// POST /swarm/spawn
{
  "name": "researcher",
  "agent": "general",
  "model": "gemini-2.5-flash",
  "systemPrompt": "Research AI trends"
}
// Response: { "agentId": "researcher", "sessionId": "abc123" }

// POST /swarm/execute
{
  "task": "Build REST API",
  "agents": ["researcher", "coder"],
  "mode": "sequential"
}
// Response: ExecutionResult[]

// GET /swarm/agents
// Response: AgentInstance[]

// DELETE /swarm/agent/:name
// Response: { "success": true }

// GET /swarm/memory/:key
// Response: { "value": any }

// POST /swarm/memory
{ "key": "api-design", "value": {...}, "ttl": 3600 }
// Response: { "success": true }
```

---

## Module Dependencies

```
┌─────────────┐
│     CLI     │
└──────┬──────┘
       │
       ▼
┌─────────────┐       ┌──────────────┐
│   Swarm     │◄─────►│ AgentManager │
│ Orchestrator│       └──────────────┘
└──────┬──────┘
       │
       ├──────────┐
       │          │
       ▼          ▼
┌─────────────┐  ┌──────────────┐
│ ModelRouter │  │ SwarmMemory  │
└─────────────┘  └──────────────┘
       │
       ▼
┌─────────────┐
│ SwarmClient │
└─────────────┘
       │
       ▼
┌─────────────┐
│  OpenCode   │
│   Server    │
└─────────────┘
```

**Build Order:**
1. Core types (`src/core/types.ts`)
2. SwarmClient (`src/core/client.ts`)
3. ModelRouter (`src/router/optimizer.ts`)
4. SwarmMemory tool (`src/tools/swarm-memory.ts`)
5. AgentManager (`src/core/agent-manager.ts`)
6. SwarmOrchestrator (`src/core/swarm.ts`)
7. CLI (`src/cli/index.ts`)
8. Server (`src/server/index.ts`)

---

## Error Handling

### Error Hierarchy

```typescript
class SwarmError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
  }
}

class AgentSpawnError extends SwarmError {
  constructor(agentName: string, cause: Error) {
    super(`Failed to spawn agent: ${agentName}`, 'AGENT_SPAWN_FAILED', { agentName, cause });
  }
}

class TaskExecutionError extends SwarmError {
  constructor(task: string, agent: string, cause: Error) {
    super(`Task execution failed: ${task}`, 'TASK_FAILED', { task, agent, cause });
  }
}

class ModelSelectionError extends SwarmError {
  constructor(reason: string) {
    super(`Model selection failed: ${reason}`, 'MODEL_SELECTION_FAILED', { reason });
  }
}
```

### Retry Policy

```typescript
interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];  // Error codes to retry
}

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'CONNECTION_ERROR']
};

async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if retryable
      const isRetryable = policy.retryableErrors.some(code =>
        error.code === code || error.message.includes(code)
      );
      
      if (!isRetryable || attempt === policy.maxAttempts) {
        throw error;
      }
      
      // Backoff
      const delay = policy.backoffMs * Math.pow(policy.backoffMultiplier, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}
```

---

## Testing Strategy

### Unit Tests
```typescript
// tests/unit/model-router.test.ts
describe('ModelRouter', () => {
  test('selects cheapest model in cost mode', async () => {
    const router = new ModelRouter({ mode: 'cost' });
    const selection = await router.selectModel('code review', agentConfig);
    expect(selection.model).toBe('deepseek/deepseek-r1');
  });
  
  test('respects max cost constraint', async () => {
    const router = new ModelRouter({ mode: 'balanced', maxCostPerTask: 0.01 });
    const selection = await router.selectModel('production code', agentConfig);
    expect(selection.estimatedCost).toBeLessThan(0.01);
  });
});
```

### Integration Tests
```typescript
// tests/integration/swarm.test.ts
describe('SwarmOrchestrator', () => {
  test('spawns and executes multiple agents', async () => {
    const swarm = new SwarmOrchestrator(config);
    
    await swarm.spawn({ name: 'agent1', agent: 'build' });
    await swarm.spawn({ name: 'agent2', agent: 'plan' });
    
    const results = await swarm.executeParallel('test task', ['agent1', 'agent2']);
    
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('fulfilled');
  });
});
```

### E2E Tests
```typescript
// tests/e2e/cli.test.ts
describe('CLI', () => {
  test('full workflow: spawn -> execute -> shutdown', async () => {
    const { stdout } = await exec('opencode-swarm spawn --agent researcher');
    expect(stdout).toContain('Agent spawned');
    
    const { stdout: execOut } = await exec('opencode-swarm exec --task "test" --agents researcher');
    expect(execOut).toContain('Execution complete');
    
    await exec('opencode-swarm shutdown');
  });
});
```

---

## Performance Considerations

### Optimization Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Agent spawn time | <2s | Fast iteration |
| Task execution overhead | <100ms | Minimal wrapper cost |
| Memory latency | <50ms | Real-time coordination |
| Concurrent agents | 10+ | Typical swarm size |
| Cold start (Docker) | <5s | Acceptable for batch jobs |

### Bottleneck Mitigation

**1. Session Creation**
- Pool sessions (pre-warm 3-5 sessions)
- Reuse sessions for sequential tasks

**2. Model Selection**
- Cache routing decisions (TTL: 1 hour)
- Pre-compute scores at startup

**3. Memory Backend**
- Use Redis for >10 agents
- Implement read-through cache

**4. API Calls**
- Connection pooling (max 50 concurrent)
- Request batching where possible

---

## Security Considerations

### API Keys
- Never log API keys
- Support environment variables and `.env` files
- Rotate keys via config reload (no restart)

### Permissions
- Respect OpenCode's permission system
- Additional layer: swarm-level tool whitelist
- Audit log for all agent actions

### Network
- TLS for OpenCode server connections
- Validate server certificates
- Rate limiting on HTTP API (100 req/min per IP)

---

## Deployment Checklist

- [ ] TypeScript builds without errors
- [ ] All tests pass (unit, integration, e2e)
- [ ] CLI smoke tests pass
- [ ] Docker image builds (<100MB)
- [ ] Kubernetes manifests validated
- [ ] Documentation complete
- [ ] Example swarms tested
- [ ] Performance benchmarks run
- [ ] Security audit complete

---

## Next Steps

1. Set up project boilerplate (tsconfig, package.json, etc.)
2. Implement `SwarmClient` with basic session management
3. Create simple CLI to spawn single agent
4. Add parallel execution support
5. Integrate model router
6. Build custom MCP memory tool
7. Add comprehensive tests
8. Create Docker deployment
9. Document and publish

---

**Ready to start implementation!** 🚀
