# OpenCode Flow - Project Specification

**Version:** 1.0.0  
**Created:** October 2025  
**Status:** Planning Phase

---

## Executive Summary

OpenCode Flow is a multi-agent orchestration framework built on top of OpenCode's HTTP server API. It enables spawning multiple specialized AI agents, each with custom models, system prompts, and tool access, coordinated through shared memory and parallel execution patterns.

### Vision
Transform OpenCode from a single-agent TUI into a programmable multi-agent flow platform capable of:
- Cost-optimized model routing (99% savings via DeepSeek, Gemini, local models)
- Parallel task decomposition across specialized agents
- Production deployment (local, Docker, Kubernetes)
- Real-time coordination via shared memory

---

## Problem Statement

### Current Limitations
1. **OpenCode** - Excellent TUI, but single-agent focused, no built-in flow coordination
2. **Agentic Flow** - Good swarm support, but tightly coupled to Claude SDK
3. **Gap** - No production-ready flow orchestrator for OpenCode's flexible agent system

### Solution
A lightweight TypeScript wrapper that:
- Spawns multiple OpenCode sessions as specialized agents
- Routes tasks to optimal models based on cost/quality tradeoffs
- Coordinates agents via custom MCP tools
- Provides CLI and programmatic APIs
- Deploys anywhere OpenCode runs

---

## Goals & Non-Goals

### Goals
✅ **Phase 1 (MVP - Week 1-2)**
- Spawn multiple OpenCode sessions programmatically
- Configure per-agent models, prompts, tools
- Basic parallel execution
- CLI interface: `opencode-flow --agents researcher,coder --task "Build API"`

✅ **Phase 2 (Model Router - Week 3)**
- Cost-optimized model selection (port from agentic-flow)
- Support Anthropic, OpenRouter, Gemini, OpenAI
- Fallback chains
- Cost tracking per agent/task

✅ **Phase 3 (Coordination - Week 4-5)**
- Shared memory via custom MCP tool
- Child session orchestration
- Result aggregation
- Event-driven coordination

✅ **Phase 4 (Production - Week 6-8)**
- Docker deployment
- Health checks & metrics
- Kubernetes manifests
- Example flows (code review, API generation, security audit)

### Non-Goals
❌ ONNX local inference (use OpenCode's provider system)
❌ Built-in E2B sandboxes (can add via MCP tool later)
❌ Custom TUI (use OpenCode's existing TUI)
❌ Replacing OpenCode (we're a wrapper, not a fork)

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Flow CLI                       │
│  $ opencode-flow --agents researcher,coder,reviewer        │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   FlowOrchestrator                         │
│  - Agent spawning       - Model routing                     │
│  - Task distribution    - Result aggregation                │
└─────────────────────────────────────────────────────────────┘
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Agent Instance  │  │  Agent Instance  │  │  Agent Instance  │
│  - Session ID    │  │  - Session ID    │  │  - Session ID    │
│  - Model config  │  │  - Model config  │  │  - Model config  │
│  - Tool access   │  │  - Tool access   │  │  - Tool access   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
          ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenCode HTTP Server (Port 4096)               │
│  /session, /message, /config, /agent                        │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     LLM Providers                           │
│  Anthropic | OpenAI | OpenRouter | Gemini | Custom         │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. **FlowClient** (`src/core/client.ts`)
- Wraps OpenCode HTTP API
- Session lifecycle management
- Message streaming
- Error handling & retries

#### 2. **ModelRouter** (`src/router/optimizer.ts`)
- Cost/quality scoring (ported from agentic-flow)
- Model selection rules
- Fallback chains
- Usage tracking

#### 3. **FlowOrchestrator** (`src/core/flow.ts`)
- Agent spawning
- Task distribution
- Parallel execution
- Result aggregation

#### 4. **FlowMemory** (`src/tools/flow-memory.ts`)
- Custom MCP tool
- Key-value store (Redis/SQLite/File)
- Cross-agent data sharing

#### 5. **AgentDefinitions** (`src/agents/`)
- Pre-built agents (researcher, coder, reviewer, tester)
- System prompts
- Tool configurations
- Permission templates

---

## Technical Specifications

### Technology Stack
- **Language:** TypeScript 5.3+
- **Runtime:** Node.js 20+ (Bun compatible)
- **SDK:** `@opencode-ai/sdk` (generated from OpenAPI spec)
- **Build:** `tsup` (for fast builds)
- **CLI:** `commander` + `chalk` + `ora`
- **Testing:** Vitest
- **Deployment:** Docker, Kubernetes

### Dependencies
```json
{
  "dependencies": {
    "@opencode-ai/sdk": "latest",
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "zod": "^3.22.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsup": "^8.0.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Key Interfaces

```typescript
// Agent Configuration
interface AgentConfig {
  name: string;
  agent: 'build' | 'plan' | 'general' | string;
  model: string;
  provider: string;
  systemPrompt?: string;
  tools?: string[];
  permissions?: PermissionConfig;
  temperature?: number;
}

// Flow Configuration
interface FlowConfig {
  agents: AgentConfig[];
  modelRouter?: ModelRouterConfig;
  memory?: MemoryConfig;
  coordination?: CoordinationConfig;
}

// Model Router
interface ModelRouterConfig {
  mode: 'cost' | 'quality' | 'balanced' | 'speed';
  maxCostPerTask?: number;
  fallbackChain?: string[];
  rules?: RoutingRule[];
}

// Task Execution
interface TaskExecution {
  task: string;
  agents: string[];
  mode: 'parallel' | 'sequential' | 'hierarchical';
  timeout?: number;
}
```

---

## API Design

### CLI Interface

```bash
# Basic usage
opencode-flow --agents researcher,coder --task "Build REST API"

# With model optimization
opencode-flow \
  --agents researcher,coder,reviewer \
  --task "Security audit" \
  --optimize cost \
  --max-cost 0.01

# Custom config
opencode-flow --config ./flow.config.json

# Interactive mode
opencode-flow --interactive

# Server mode (HTTP API)
opencode-flow serve --port 5000
```

### Programmatic API

```typescript
import { OpencodeFlow } from 'opencode-flow';

// Initialize flow
const flow = new OpencodeFlow({
  serverUrl: 'http://localhost:4096',
  modelRouter: {
    mode: 'balanced',
    fallbackChain: ['anthropic/claude-sonnet-4', 'deepseek/r1']
  }
});

// Spawn agents
const researcher = await flow.spawn({
  name: 'researcher',
  agent: 'general',
  model: 'gemini-2.5-flash',
  systemPrompt: 'Research AI trends and summarize findings'
});

const coder = await flow.spawn({
  name: 'coder',
  agent: 'build',
  model: 'anthropic/claude-sonnet-4',
  tools: ['read', 'write', 'edit', 'bash']
});

// Execute tasks
const results = await flow.execute({
  task: 'Build a REST API with authentication',
  agents: ['researcher', 'coder'],
  mode: 'sequential'
});

// Access shared memory
await flow.memory.set('api-design', results[0].output);
const design = await flow.memory.get('api-design');

// Cleanup
await flow.shutdown();
```

---

## Data Flow

### Agent Spawn Sequence
```
1. User: opencode-flow --agents researcher,coder
2. CLI parses config → FlowOrchestrator.init()
3. For each agent:
   a. POST /session (create new session)
   b. Configure agent via message or config
   c. Store session ID in agent map
4. Return agent handles
```

### Task Execution Flow
```
1. User: flow.execute({ task, agents })
2. ModelRouter.selectModel(task, agent) → optimal model
3. For each agent (parallel/sequential):
   a. POST /session/:id/message { text: task }
   b. Stream response via SSE /event
   c. Collect results
4. Aggregate results → return to user
```

### Memory Coordination
```
1. Agent A: Use flow_memory_set tool
2. Custom MCP tool → writes to shared store
3. Agent B: Use flow_memory_get tool
4. Custom MCP tool → reads from shared store
5. Coordination achieved without direct communication
```

---

## Deployment Strategy

### Local Development
```bash
# Terminal 1: Start OpenCode server
opencode serve --port 4096

# Terminal 2: Run flow
opencode-flow --agents researcher,coder --task "Build API"
```

### Docker
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
CMD ["node", "dist/cli.js"]
```

### Kubernetes
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: flow-code-review
spec:
  template:
    spec:
      containers:
      - name: flow
        image: opencode-flow:latest
        args: ["--agents", "reviewer", "--task", "Review PR #123"]
        env:
        - name: OPENCODE_SERVER_URL
          value: "http://opencode-server:4096"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: llm-keys
              key: anthropic
      restartPolicy: Never
```

---

## Cost Analysis

### Without Model Router (Always Claude Sonnet 4)
- 100 code reviews/day × $0.08 each = **$8/day = $240/month**

### With Model Router (DeepSeek R1 for reviews)
- 100 code reviews/day × $0.012 each = **$1.20/day = $36/month**
- **Savings: $204/month (85%)**

### Optimization by Task Type
| Task Type | Model | Cost | Quality Score |
|-----------|-------|------|---------------|
| Code Review | DeepSeek R1 | $0.012 | 90/100 |
| Research | Gemini 2.5 Flash | $0.0003 | 78/100 |
| Production Code | Claude Sonnet 4 | $0.08 | 95/100 |
| Testing | Llama 3.1 8B | $0.0006 | 75/100 |

---

## Success Metrics

### Phase 1 (MVP)
- ✅ Spawn 3+ agents programmatically
- ✅ Execute tasks in parallel
- ✅ CLI with 5+ flags working
- ✅ Basic error handling

### Phase 2 (Model Router)
- ✅ 70%+ cost reduction on reviews
- ✅ Support 5+ model providers
- ✅ Automatic fallback on errors
- ✅ Cost tracking dashboard

### Phase 3 (Coordination)
- ✅ Shared memory with <100ms latency
- ✅ 10+ agents coordinating successfully
- ✅ Hierarchical task decomposition

### Phase 4 (Production)
- ✅ Docker image <100MB
- ✅ Deploy to Kubernetes
- ✅ 3+ example flows documented
- ✅ <2s cold start time

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OpenCode API changes | High | Medium | Pin SDK version, version compatibility matrix |
| Model provider outages | Medium | Low | Fallback chains, retry logic |
| Memory coordination overhead | Medium | Medium | Benchmark early, use Redis if needed |
| Session management complexity | High | Medium | Comprehensive tests, session lifecycle docs |

---

## Timeline

### Week 1-2: MVP
- [ ] Project setup, TypeScript config
- [ ] FlowClient wrapper
- [ ] Basic agent spawning
- [ ] CLI skeleton
- [ ] Parallel execution

### Week 3: Model Router
- [ ] Port agentic-flow router logic
- [ ] Add provider configs
- [ ] Cost tracking
- [ ] Fallback implementation

### Week 4-5: Coordination
- [ ] Custom MCP memory tool
- [ ] Child session orchestration
- [ ] Result aggregation
- [ ] Event-driven coordination

### Week 6-8: Production
- [ ] Docker setup
- [ ] Kubernetes manifests
- [ ] Example flows
- [ ] Documentation
- [ ] Launch blog post

---

## Open Questions

1. **Memory Backend**: Redis vs SQLite vs simple file-based?
   - Recommendation: Start with file-based, add Redis adapter later

2. **Session Cleanup**: Auto-cleanup after timeout or manual?
   - Recommendation: Auto-cleanup with configurable TTL

3. **Error Handling**: Retry failed agents or fail entire flow?
   - Recommendation: Configurable, default to retry 3x then continue

4. **Streaming**: Real-time output or batch results?
   - Recommendation: Both via `--stream` flag

---

## Next Steps

1. ✅ **You are here** - Review spec, get feedback
2. Create detailed implementation plan
3. Set up project boilerplate
4. Implement Phase 1 (MVP)
5. Gather early feedback
6. Iterate to Phase 4

---

## References

- [OpenCode Docs](https://opencode.ai/docs/)
- [OpenCode Server API](https://opencode.ai/docs/server/)
- [Agentic Flow](https://github.com/ruvnet/agentic-flow)
- [Model Context Protocol](https://modelcontextprotocol.io)
