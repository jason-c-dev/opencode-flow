# OpenCode Swarm - API Reference

**Version:** 1.0.0

---

## Table of Contents

- [CLI API](#cli-api)
- [Programmatic API](#programmatic-api)
- [HTTP Server API](#http-server-api)
- [MCP Tools](#mcp-tools)
- [Configuration Files](#configuration-files)

---

## CLI API

### `opencode-swarm spawn`

Spawn a new agent instance.

```bash
opencode-swarm spawn [options]
```

**Options:**
- `--name <string>` - Agent name (required)
- `--agent <type>` - OpenCode agent type (build, plan, general, custom)
- `--model <string>` - Model identifier (e.g., `claude-sonnet-4`)
- `--provider <string>` - Provider (anthropic, openai, google, openrouter)
- `--prompt <string>` - Custom system prompt
- `--tools <list>` - Comma-separated tool list
- `--config <path>` - Path to agent config JSON

**Examples:**
```bash
# Spawn researcher with Gemini
opencode-swarm spawn --name researcher --agent general --model gemini-2.5-flash

# Spawn coder with custom prompt
opencode-swarm spawn \
  --name coder \
  --agent build \
  --model claude-sonnet-4 \
  --prompt "You are an expert TypeScript developer"

# Spawn from config file
opencode-swarm spawn --config ./agents/reviewer.json
```

---

### `opencode-swarm exec`

Execute a task across one or more agents.

```bash
opencode-swarm exec [options]
```

**Options:**
- `--task <string>` - Task description (required)
- `--agents <list>` - Comma-separated agent names (required)
- `--mode <type>` - Execution mode: `parallel`, `sequential`, `hierarchical` (default: `parallel`)
- `--timeout <ms>` - Task timeout in milliseconds
- `--optimize <mode>` - Model optimization: `cost`, `quality`, `balanced`, `speed`
- `--max-cost <number>` - Maximum cost per task in dollars
- `--stream` - Stream output in real-time
- `--output <path>` - Save results to file

**Examples:**
```bash
# Parallel execution
opencode-swarm exec \
  --task "Build REST API with auth" \
  --agents researcher,coder \
  --mode parallel

# Sequential with cost optimization
opencode-swarm exec \
  --task "Security audit" \
  --agents reviewer,tester \
  --mode sequential \
  --optimize cost \
  --max-cost 0.05

# Stream output
opencode-swarm exec \
  --task "Generate docs" \
  --agents coder \
  --stream
```

---

### `opencode-swarm list`

List all active agents.

```bash
opencode-swarm list [options]
```

**Options:**
- `--json` - Output as JSON
- `--verbose` - Show detailed agent info

**Output:**
```
NAME          AGENT    MODEL              STATUS    SESSION
researcher    general  gemini-2.5-flash   idle      a1b2c3d4
coder         build    claude-sonnet-4    busy      e5f6g7h8
reviewer      plan     deepseek-r1        idle      i9j0k1l2
```

---

### `opencode-swarm terminate`

Terminate one or all agents.

```bash
opencode-swarm terminate [name]
```

**Examples:**
```bash
# Terminate specific agent
opencode-swarm terminate researcher

# Terminate all agents
opencode-swarm terminate --all
```

---

### `opencode-swarm serve`

Start HTTP server for programmatic access.

```bash
opencode-swarm serve [options]
```

**Options:**
- `--port <number>` - Server port (default: 5000)
- `--host <string>` - Server host (default: 127.0.0.1)
- `--cors` - Enable CORS

**Example:**
```bash
opencode-swarm serve --port 5000 --cors
```

---

### `opencode-swarm config`

Manage configuration.

```bash
# Show current config
opencode-swarm config show

# Set config value
opencode-swarm config set router.mode cost

# Initialize config file
opencode-swarm config init
```

---

## Programmatic API

### SwarmOrchestrator

Main class for managing agent swarms.

```typescript
import { OpencodeSwarm } from 'opencode-swarm';

const swarm = new OpencodeSwarm(config);
```

#### Constructor

```typescript
constructor(config?: SwarmConfig)
```

**Parameters:**
- `config.serverUrl` - OpenCode server URL (default: `http://localhost:4096`)
- `config.modelRouter` - Model router configuration
- `config.memory` - Memory backend configuration
- `config.agents` - Pre-configured agents

**Example:**
```typescript
const swarm = new OpencodeSwarm({
  serverUrl: 'http://localhost:4096',
  modelRouter: {
    mode: 'balanced',
    maxCostPerTask: 0.1,
    fallbackChain: ['anthropic/claude-sonnet-4', 'deepseek/r1']
  },
  memory: {
    backend: 'redis',
    url: 'redis://localhost:6379'
  }
});
```

---

#### spawn()

Spawn a new agent instance.

```typescript
async spawn(config: AgentConfig): Promise<AgentInstance>
```

**Parameters:**
```typescript
interface AgentConfig {
  name: string;              // Unique agent name
  agent: string;             // OpenCode agent type
  model: string;             // Model identifier
  provider?: string;         // Provider override
  systemPrompt?: string;     // Custom system prompt
  tools?: string[];          // Tool whitelist
  permissions?: object;      // Permission overrides
  temperature?: number;      // 0.0-1.0
  maxTokens?: number;
  minQuality?: number;       // For model router
}
```

**Returns:**
```typescript
interface AgentInstance {
  name: string;
  sessionId: string;
  config: AgentConfig;
  status: 'idle' | 'busy' | 'error';
  createdAt: number;
  lastActivity: number;
}
```

**Example:**
```typescript
const researcher = await swarm.spawn({
  name: 'researcher',
  agent: 'general',
  model: 'gemini-2.5-flash',
  systemPrompt: 'Research AI trends and provide summaries',
  tools: ['read', 'grep', 'webfetch']
});
```

---

#### execute()

Execute a task across agents.

```typescript
async execute(task: TaskExecution): Promise<ExecutionResult[]>
```

**Parameters:**
```typescript
interface TaskExecution {
  task: string;                          // Task description
  agents: string[];                      // Agent names
  mode?: 'parallel' | 'sequential' | 'hierarchical';
  timeout?: number;                      // Milliseconds
  retryPolicy?: RetryPolicy;
  optimize?: 'cost' | 'quality' | 'balanced' | 'speed';
  maxCostPerTask?: number;
}
```

**Returns:**
```typescript
interface ExecutionResult {
  agent: string;
  status: 'fulfilled' | 'rejected';
  output?: any;
  error?: Error;
  duration: number;           // Milliseconds
  cost: number;               // Dollars
  tokensUsed: {
    input: number;
    output: number;
  };
}
```

**Example:**
```typescript
const results = await swarm.execute({
  task: 'Build a REST API with authentication',
  agents: ['researcher', 'coder'],
  mode: 'sequential',
  optimize: 'cost',
  maxCostPerTask: 0.05
});

for (const result of results) {
  console.log(`${result.agent}: ${result.status}`);
  console.log(`Cost: $${result.cost.toFixed(4)}`);
  console.log(`Output: ${result.output}`);
}
```

---

#### executeParallel()

Execute task across agents in parallel.

```typescript
async executeParallel(task: string, agents: string[]): Promise<ExecutionResult[]>
```

**Example:**
```typescript
const results = await swarm.executeParallel(
  'Analyze this codebase',
  ['researcher', 'coder', 'reviewer']
);
```

---

#### executeSequential()

Execute task across agents sequentially (output from one feeds into next).

```typescript
async executeSequential(task: string, agents: string[]): Promise<ExecutionResult[]>
```

**Example:**
```typescript
// Research → Design → Implement → Test
const results = await swarm.executeSequential(
  'Build user authentication',
  ['researcher', 'architect', 'coder', 'tester']
);
```

---

#### terminate()

Terminate an agent.

```typescript
async terminate(agentName: string): Promise<void>
```

**Example:**
```typescript
await swarm.terminate('researcher');
```

---

#### shutdown()

Shutdown all agents and cleanup.

```typescript
async shutdown(): Promise<void>
```

**Example:**
```typescript
await swarm.shutdown();
```

---

#### memory

Access shared memory.

```typescript
readonly memory: SwarmMemory
```

**Methods:**
```typescript
interface SwarmMemory {
  set(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  clear(): Promise<void>;
}
```

**Example:**
```typescript
// Store data
await swarm.memory.set('api-design', { 
  endpoints: ['/users', '/auth'],
  database: 'postgresql'
}, 3600); // TTL: 1 hour

// Retrieve data
const design = await swarm.memory.get('api-design');

// List all keys
const keys = await swarm.memory.list();
```

---

### ModelRouter

Standalone model optimization.

```typescript
import { ModelRouter } from 'opencode-swarm/router';

const router = new ModelRouter(config);
```

#### selectModel()

Select optimal model for a task.

```typescript
async selectModel(
  task: string, 
  agentConfig: AgentConfig
): Promise<ModelSelection>
```

**Returns:**
```typescript
interface ModelSelection {
  provider: string;
  model: string;
  reasoning: string;
  estimatedCost: number;
  qualityScore: number;
}
```

**Example:**
```typescript
const router = new ModelRouter({ mode: 'cost' });

const selection = await router.selectModel(
  'Code review for security',
  { agent: 'reviewer', minQuality: 80 }
);

console.log(`Selected: ${selection.model}`);
console.log(`Reason: ${selection.reasoning}`);
console.log(`Estimated cost: $${selection.estimatedCost}`);
```

---

#### getCostAnalytics()

Get cost analytics.

```typescript
getCostAnalytics(): CostAnalytics
```

**Returns:**
```typescript
interface CostAnalytics {
  totalCost: number;
  costByModel: Record<string, number>;
  costByAgent: Record<string, number>;
  tokenUsage: {
    input: number;
    output: number;
  };
  requestCount: number;
}
```

**Example:**
```typescript
const analytics = router.getCostAnalytics();
console.log(`Total spent: $${analytics.totalCost.toFixed(2)}`);
console.log(`Requests: ${analytics.requestCount}`);
```

---

## HTTP Server API

Start server: `opencode-swarm serve --port 5000`

Base URL: `http://localhost:5000`

### POST /swarm/spawn

Spawn a new agent.

**Request:**
```json
{
  "name": "researcher",
  "agent": "general",
  "model": "gemini-2.5-flash",
  "systemPrompt": "Research AI trends"
}
```

**Response:**
```json
{
  "name": "researcher",
  "sessionId": "abc123",
  "status": "idle",
  "createdAt": 1699999999999
}
```

---

### POST /swarm/execute

Execute a task.

**Request:**
```json
{
  "task": "Build REST API",
  "agents": ["researcher", "coder"],
  "mode": "sequential",
  "optimize": "cost"
}
```

**Response:**
```json
[
  {
    "agent": "researcher",
    "status": "fulfilled",
    "output": "API design: ...",
    "duration": 5000,
    "cost": 0.002,
    "tokensUsed": { "input": 500, "output": 1000 }
  },
  {
    "agent": "coder",
    "status": "fulfilled",
    "output": "Implementation: ...",
    "duration": 12000,
    "cost": 0.015,
    "tokensUsed": { "input": 1500, "output": 3000 }
  }
]
```

---

### GET /swarm/agents

List all agents.

**Response:**
```json
[
  {
    "name": "researcher",
    "sessionId": "abc123",
    "status": "idle",
    "config": { ... }
  }
]
```

---

### DELETE /swarm/agent/:name

Terminate an agent.

**Response:**
```json
{
  "success": true,
  "message": "Agent 'researcher' terminated"
}
```

---

### GET /swarm/memory/:key

Get memory value.

**Response:**
```json
{
  "key": "api-design",
  "value": { "endpoints": [...] },
  "createdAt": 1699999999999
}
```

---

### POST /swarm/memory

Set memory value.

**Request:**
```json
{
  "key": "api-design",
  "value": { "endpoints": ["/users"] },
  "ttl": 3600
}
```

**Response:**
```json
{
  "success": true
}
```

---

### GET /swarm/analytics

Get cost analytics.

**Response:**
```json
{
  "totalCost": 2.45,
  "costByModel": {
    "claude-sonnet-4": 1.80,
    "deepseek-r1": 0.35,
    "gemini-2.5-flash": 0.30
  },
  "requestCount": 150,
  "tokenUsage": {
    "input": 50000,
    "output": 125000
  }
}
```

---

## MCP Tools

Custom MCP tools for swarm coordination.

### swarm_memory_set

Store data in shared memory.

**Arguments:**
- `key` (string, required) - Memory key
- `value` (any, required) - Value to store
- `ttl` (number, optional) - Time to live in seconds

**Example:**
```json
{
  "key": "user-stories",
  "value": ["As a user, I want to...", "As an admin, I need to..."],
  "ttl": 7200
}
```

**Returns:** `"Stored: user-stories"`

---

### swarm_memory_get

Retrieve data from shared memory.

**Arguments:**
- `key` (string, required) - Memory key

**Example:**
```json
{
  "key": "user-stories"
}
```

**Returns:** Value or `null` if not found

---

### swarm_memory_list

List all keys in memory.

**Arguments:** None

**Returns:** Array of key strings

---

### swarm_memory_delete

Delete key from memory.

**Arguments:**
- `key` (string, required) - Memory key

**Returns:** `"Deleted: user-stories"`

---

## Configuration Files

### swarm.config.json

Main configuration file.

```json
{
  "$schema": "https://opencode-swarm.dev/schema.json",
  "serverUrl": "http://localhost:4096",
  "modelRouter": {
    "mode": "balanced",
    "maxCostPerTask": 0.1,
    "fallbackChain": [
      "anthropic/claude-sonnet-4",
      "deepseek/deepseek-r1",
      "google/gemini-2.5-flash"
    ],
    "rules": [
      {
        "condition": { "taskType": "code-review", "privacy": "high" },
        "action": { "provider": "anthropic", "model": "claude-sonnet-4" },
        "reasoning": "High privacy requires on-premise model"
      }
    ]
  },
  "memory": {
    "backend": "file",
    "path": "./.swarm-memory"
  },
  "agents": [
    {
      "name": "researcher",
      "agent": "general",
      "model": "gemini-2.5-flash",
      "tools": ["read", "grep", "webfetch"]
    },
    {
      "name": "coder",
      "agent": "build",
      "model": "claude-sonnet-4",
      "tools": ["read", "write", "edit", "bash"]
    }
  ]
}
```

---

### agent-config.json

Individual agent configuration.

```json
{
  "name": "security-auditor",
  "agent": "plan",
  "model": "claude-sonnet-4",
  "provider": "anthropic",
  "systemPrompt": "You are a security expert. Focus on vulnerabilities.",
  "tools": ["read", "grep", "webfetch"],
  "permissions": {
    "edit": "deny",
    "bash": "deny",
    "webfetch": "allow"
  },
  "temperature": 0.1,
  "maxTokens": 4096,
  "minQuality": 90
}
```

---

## Environment Variables

```bash
# OpenCode server
OPENCODE_SERVER_URL=http://localhost:4096

# API keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=sk-or-v1-...

# Swarm configuration
SWARM_MODE=production
SWARM_MEMORY_BACKEND=redis
SWARM_MEMORY_URL=redis://localhost:6379
SWARM_LOG_LEVEL=info

# Model router
ROUTER_MODE=balanced
ROUTER_MAX_COST=0.5
```

---

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AGENT_SPAWN_FAILED` | Failed to create agent | 500 |
| `AGENT_NOT_FOUND` | Agent doesn't exist | 404 |
| `TASK_FAILED` | Task execution error | 500 |
| `MODEL_SELECTION_FAILED` | No suitable model found | 400 |
| `RATE_LIMIT` | Provider rate limit hit | 429 |
| `TIMEOUT` | Task timeout exceeded | 408 |
| `INVALID_CONFIG` | Configuration error | 400 |
| `MEMORY_ERROR` | Memory backend error | 500 |

---

## Type Definitions

Full TypeScript definitions available in the package:

```typescript
import type {
  SwarmConfig,
  AgentConfig,
  AgentInstance,
  TaskExecution,
  ExecutionResult,
  ModelRouterConfig,
  ModelSelection,
  SwarmMemory,
  CostAnalytics
} from 'opencode-swarm';
```

---

**For more examples, see `/examples` directory in the repository.**
