# Getting Started with OpenCode Flow

This guide will walk you through setting up and using OpenCode Flow for the first time.

---

## Prerequisites

1. **OpenCode installed and running**
   ```bash
   # Install OpenCode
   npm install -g opencode-ai
   
   # Start OpenCode server
   opencode serve --port 4096
   ```

2. **Node.js 20+**
   ```bash
   node --version  # Should be 20.x or higher
   ```

3. **API Keys** for your chosen LLM providers
   - Anthropic Claude: https://console.anthropic.com/
   - OpenAI: https://platform.openai.com/
   - Google Gemini: https://ai.google.dev/
   - OpenRouter: https://openrouter.ai/

---

## Installation

### Option 1: npm (coming soon)
```bash
npm install -g opencode-flow
```

### Option 2: From source
```bash
# Clone repository
git clone https://github.com/yourusername/opencode-flow.git
cd opencode-flow

# Install dependencies
npm install

# Build
npm run build

# Link globally
npm link
```

---

## Quick Start: 5-Minute Tutorial

### Step 1: Set up environment

Create `.env` file:
```bash
# OpenCode server
OPENCODE_SERVER_URL=http://localhost:4096

# API keys (add only what you need)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=sk-or-v1-...
```

### Step 2: Spawn your first agent

```bash
# Spawn a researcher agent with Gemini (fast & cheap)
opencode-flow spawn \
  --name researcher \
  --agent general \
  --model gemini-2.5-flash
```

You should see:
```
✓ Agent 'researcher' spawned successfully
  Session ID: abc123...
  Model: gemini-2.5-flash
  Status: idle
```

### Step 3: Execute a task

```bash
# Run a simple research task
opencode-flow exec \
  --task "Research best practices for REST API authentication" \
  --agents researcher
```

Output:
```
⠋ Executing task across 1 agent(s)...
✓ researcher: completed in 5.2s

Results:
─────────────────────────────────────────
Agent: researcher
Status: fulfilled
Cost: $0.0003
Tokens: 500 input, 1200 output

Output:
Here are the best practices for REST API authentication:
1. Use OAuth 2.0 for third-party access...
2. Implement JWT for stateless sessions...
...
```

### Step 4: Spawn multiple agents

```bash
# Spawn a coder agent
opencode-flow spawn \
  --name coder \
  --agent build \
  --model claude-sonnet-4

# List active agents
opencode-flow list
```

Output:
```
NAME          AGENT    MODEL              STATUS    SESSION
researcher    general  gemini-2.5-flash   idle      abc123
coder         build    claude-sonnet-4    idle      def456
```

### Step 5: Execute across multiple agents

```bash
# Sequential execution (research → code)
opencode-flow exec \
  --task "Build a JWT authentication endpoint" \
  --agents researcher,coder \
  --mode sequential
```

The researcher's output feeds into the coder's input!

---

## Programmatic Usage

Create `example.ts`:

```typescript
import { OpencodeFlow } from 'opencode-flow';

async function main() {
  // 1. Initialize flow
  const flow = new OpencodeFlow({
    serverUrl: 'http://localhost:4096',
    modelRouter: {
      mode: 'balanced',
      maxCostPerTask: 0.1
    }
  });

  // 2. Spawn agents
  const researcher = await flow.spawn({
    name: 'researcher',
    agent: 'general',
    model: 'gemini-2.5-flash',
    systemPrompt: 'Research AI trends and provide concise summaries'
  });

  const coder = await flow.spawn({
    name: 'coder',
    agent: 'build',
    model: 'claude-sonnet-4',
    tools: ['read', 'write', 'edit', 'bash']
  });

  // 3. Execute task
  const results = await flow.execute({
    task: 'Build a REST API with JWT authentication',
    agents: ['researcher', 'coder'],
    mode: 'sequential'
  });

  // 4. Print results
  for (const result of results) {
    console.log(`\n${result.agent}:`);
    console.log(`Status: ${result.status}`);
    console.log(`Cost: $${result.cost.toFixed(4)}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  }

  // 5. Cleanup
  await flow.shutdown();
}

main().catch(console.error);
```

Run it:
```bash
npx tsx example.ts
```

---

## Common Patterns

### Pattern 1: Cost-Optimized Code Review

```typescript
const flow = new OpencodeFlow({
  modelRouter: { mode: 'cost' }  // Prioritize cheapest models
});

const reviewer = await flow.spawn({
  name: 'reviewer',
  agent: 'plan',  // Read-only mode
  model: 'auto',  // Router selects: DeepSeek R1 (85% cheaper)
  minQuality: 80  // Ensure quality threshold
});

const results = await flow.execute({
  task: `Review this PR:\n${prDiff}`,
  agents: ['reviewer']
});
// Cost: ~$0.012 (vs $0.08 with Claude)
```

### Pattern 2: Parallel Analysis

```typescript
// Spawn 3 specialized agents
await Promise.all([
  flow.spawn({ name: 'security', agent: 'plan', model: 'claude-sonnet-4' }),
  flow.spawn({ name: 'performance', agent: 'general', model: 'gemini-2.5-flash' }),
  flow.spawn({ name: 'style', agent: 'plan', model: 'deepseek-r1' })
]);

// Execute in parallel
const results = await flow.executeParallel(
  'Analyze this codebase',
  ['security', 'performance', 'style']
);
// All 3 run simultaneously!
```

### Pattern 3: Shared Memory Coordination

```typescript
// Agent 1: Research
const research = await flow.execute({
  task: 'Research authentication methods',
  agents: ['researcher']
});

// Store in shared memory
await flow.memory.set('auth-research', research[0].output, 3600);

// Agent 2: Implement (accesses shared memory)
await flow.execute({
  task: 'Implement auth based on research in memory',
  agents: ['coder']
});
// Coder agent can call flow_memory_get('auth-research')
```

### Pattern 4: Hierarchical Delegation

```typescript
const results = await flow.executeHierarchical(
  'Build a microservices architecture',
  'architect',     // Coordinator
  ['coder1', 'coder2', 'coder3']  // Workers
);
// Architect delegates tasks to coders
```

---

## Configuration

### flow.config.json

Create a config file for reusable settings:

```json
{
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
        "condition": { "taskType": "code-review" },
        "action": { "provider": "openrouter", "model": "deepseek-r1" },
        "reasoning": "Code review benefits from reasoning at low cost"
      }
    ]
  },
  "memory": {
    "backend": "file",
    "path": "./.flow-memory"
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

Load config:
```bash
opencode-flow --config flow.config.json exec --task "..."
```

Or programmatically:
```typescript
import config from './flow.config.json';
const flow = new OpencodeFlow(config);
```

---

## Next Steps

1. **Explore Examples**
   - `/examples/code-review-flow.ts` - Automated PR reviews
   - `/examples/api-generator-flow.ts` - Multi-phase API generation
   - `/examples/security-audit-flow.ts` - Parallel security analysis

2. **Read Documentation**
   - [API Reference](./API_REFERENCE.md) - Complete API docs
   - [Implementation Design](./IMPLEMENTATION_DESIGN.md) - Technical details
   - [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Docker, Kubernetes

3. **Join Community**
   - GitHub Discussions
   - Discord server

4. **Contribute**
   - See [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## Troubleshooting

### "Connection refused" error
```
Error: connect ECONNREFUSED 127.0.0.1:4096
```
**Solution:** Make sure OpenCode server is running:
```bash
opencode serve --port 4096
```

### "Agent spawn failed"
```
AgentSpawnError: Failed to spawn agent: researcher
```
**Solution:** Check OpenCode logs and ensure API key is set:
```bash
echo $ANTHROPIC_API_KEY
```

### "Model selection failed"
```
ModelSelectionError: No suitable model found
```
**Solution:** Relax constraints or add fallback:
```typescript
modelRouter: {
  mode: 'balanced',
  maxCostPerTask: 1.0,  // Increase budget
  fallbackChain: ['anthropic/claude-sonnet-4']
}
```

### High costs
**Solution:** Use cost optimization:
```bash
opencode-flow exec \
  --task "..." \
  --agents reviewer \
  --optimize cost \
  --max-cost 0.01
```

---

## Support

- **Issues:** https://github.com/yourusername/opencode-flow/issues
- **Discussions:** https://github.com/yourusername/opencode-flow/discussions
- **Discord:** https://discord.gg/opencode-flow

Happy flowing! 🚀
