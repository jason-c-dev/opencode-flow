# Contributing to OpenCode Flow

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to OpenCode Flow.

---

## Code of Conduct

Be respectful, collaborative, and constructive. We're building tools to help developers, so let's help each other.

---

## Getting Started

### 1. Fork & Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/opencode-flow.git
cd opencode-flow
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set up Development Environment

```bash
# Start OpenCode server (required for integration tests)
opencode serve --port 4096

# Copy environment template
cp .env.example .env

# Add your API keys
vim .env
```

### 4. Run Tests

```bash
# Unit tests
npm run test:unit

# Integration tests (requires OpenCode server)
npm run test:integration

# All tests
npm test
```

### 5. Build

```bash
npm run build
```

---

## Development Workflow

### Branch Strategy

- `main` - Stable releases
- `dev` - Development branch
- `feature/<name>` - New features
- `fix/<name>` - Bug fixes

**Always create feature branches from `dev`:**

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-awesome-feature
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add hierarchical execution mode
fix: resolve agent spawn timeout
docs: update API reference
test: add model router tests
chore: update dependencies
```

**Examples:**
```bash
git commit -m "feat: add cost analytics dashboard"
git commit -m "fix: memory backend TTL expiration"
git commit -m "docs: add Docker deployment guide"
```

---

## Project Structure

Understanding the codebase:

```
src/
├── core/
│   ├── types.ts           # Type definitions
│   ├── client.ts          # OpenCode API wrapper
│   ├── flow.ts           # Main orchestrator
│   └── agent-manager.ts   # Agent lifecycle
├── router/
│   ├── optimizer.ts       # Model selection
│   ├── providers.ts       # Provider configs
│   └── cost-tracker.ts    # Usage tracking
├── agents/
│   └── definitions/       # Pre-built agents
├── tools/
│   └── flow-memory.ts    # MCP tools
├── cli/
│   └── index.ts           # CLI interface
└── utils/
    ├── logger.ts
    └── errors.ts
```

---

## What to Contribute

### 🐛 Bug Fixes

Found a bug? Great!

1. Check [existing issues](https://github.com/yourusername/opencode-flow/issues)
2. Create new issue if needed
3. Fix the bug
4. Add regression test
5. Submit PR

### ✨ New Features

Have an idea? Let's discuss first!

1. Create a [feature request issue](https://github.com/yourusername/opencode-flow/issues/new?template=feature_request.md)
2. Discuss approach with maintainers
3. Get approval
4. Implement feature
5. Add tests & docs
6. Submit PR

### 📚 Documentation

Docs are always welcome!

- Fix typos
- Improve clarity
- Add examples
- Create tutorials

### 🧪 Tests

Help us reach 90%+ coverage!

- Unit tests (`tests/unit/`)
- Integration tests (`tests/integration/`)
- E2E tests (`tests/e2e/`)

---

## Testing Guidelines

### Unit Tests

Test individual functions/classes in isolation:

```typescript
// tests/unit/model-router.test.ts
import { describe, test, expect } from 'vitest';
import { ModelRouter } from '../../src/router/optimizer';

describe('ModelRouter', () => {
  test('selects cheapest model in cost mode', async () => {
    const router = new ModelRouter({ mode: 'cost' });
    const selection = await router.selectModel('code review', {
      agent: 'reviewer',
      minQuality: 70
    });
    
    expect(selection.model).toBe('deepseek-r1');
    expect(selection.estimatedCost).toBeLessThan(0.02);
  });
});
```

### Integration Tests

Test component interactions:

```typescript
// tests/integration/flow.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { OpencodeFlow } from '../../src/core/flow';

describe('FlowOrchestrator Integration', () => {
  let flow: OpencodeFlow;

  beforeAll(async () => {
    flow = new OpencodeFlow({ serverUrl: 'http://localhost:4096' });
  });

  afterAll(async () => {
    await flow.shutdown();
  });

  test('spawns and executes agents', async () => {
    await flow.spawn({ name: 'agent1', agent: 'build', model: 'test-model' });
    const results = await flow.execute({
      task: 'test task',
      agents: ['agent1']
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('fulfilled');
  });
});
```

### E2E Tests

Test CLI and full workflows:

```typescript
// tests/e2e/cli.test.ts
import { describe, test, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI E2E', () => {
  test('spawn and execute workflow', async () => {
    // Spawn agent
    const { stdout: spawnOut } = await execAsync(
      'opencode-flow spawn --name test-agent --agent general --model test'
    );
    expect(spawnOut).toContain('spawned successfully');

    // Execute task
    const { stdout: execOut } = await execAsync(
      'opencode-flow exec --task "test" --agents test-agent'
    );
    expect(execOut).toContain('completed');

    // Cleanup
    await execAsync('opencode-flow terminate test-agent');
  });
});
```

---

## Code Style

### TypeScript Guidelines

1. **Use strict typing**
   ```typescript
   // ❌ Bad
   function process(data: any) { ... }
   
   // ✅ Good
   function process(data: ExecutionResult[]) { ... }
   ```

2. **Use interfaces for objects**
   ```typescript
   // ✅ Good
   interface AgentConfig {
     name: string;
     model: string;
   }
   ```

3. **Document public APIs**
   ```typescript
   /**
    * Spawns a new agent instance
    * @param config Agent configuration
    * @returns AgentInstance with session ID
    */
   async spawn(config: AgentConfig): Promise<AgentInstance> {
     // ...
   }
   ```

4. **Use async/await over promises**
   ```typescript
   // ❌ Bad
   return client.sendMessage(...).then(result => ...);
   
   // ✅ Good
   const result = await client.sendMessage(...);
   ```

5. **Handle errors explicitly**
   ```typescript
   try {
     const result = await risky Operation();
   } catch (error) {
     if (error instanceof RateLimitError) {
       // Handle specifically
     }
     throw new FlowError('Operation failed', 'OP_FAILED', { error });
   }
   ```

### File Naming

- `kebab-case.ts` for files
- `PascalCase` for classes/types
- `camelCase` for functions/variables

---

## Pull Request Process

### 1. Before Submitting

- [ ] Tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Linter passes (`npm run lint`)
- [ ] Docs updated if needed
- [ ] CHANGELOG.md updated

### 2. PR Title

Use conventional commit format:

```
feat: add hierarchical execution mode
fix: resolve memory leak in agent manager
docs: update getting started guide
```

### 3. PR Description Template

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- Change 1
- Change 2

## Testing
How was this tested?

## Screenshots
If applicable

## Checklist
- [ ] Tests added/updated
- [ ] Docs updated
- [ ] CHANGELOG.md updated
- [ ] No breaking changes (or documented)
```

### 4. Review Process

1. CI checks must pass
2. At least 1 maintainer approval
3. All conversations resolved
4. Up to date with `dev` branch

### 5. Merge

We'll squash-merge your PR to keep git history clean.

---

## Adding New Features

### Example: Adding a New Execution Mode

**1. Update types** (`src/core/types.ts`):
```typescript
export type ExecutionMode = 
  | 'parallel' 
  | 'sequential' 
  | 'hierarchical'
  | 'round-robin';  // New mode
```

**2. Implement** (`src/core/flow.ts`):
```typescript
async executeRoundRobin(
  task: string,
  agents: string[]
): Promise<ExecutionResult[]> {
  // Implementation
}
```

**3. Add tests** (`tests/unit/flow.test.ts`):
```typescript
test('round-robin distributes tasks evenly', async () => {
  // Test implementation
});
```

**4. Update docs** (`docs/API_REFERENCE.md`):
```markdown
### executeRoundRobin()

Executes task in round-robin fashion across agents.
...
```

**5. Add example** (`examples/round-robin-example.ts`):
```typescript
// Usage example
```

---

## Adding New Model Providers

**1. Add provider info** (`src/router/providers.ts`):
```typescript
export const MODELS: ModelInfo[] = [
  // ... existing
  {
    provider: 'new-provider',
    name: 'model-name',
    costPerInputToken: 0.001,
    costPerOutputToken: 0.002,
    tokensPerSecond: 50,
    benchmarkScores: {
      'code-generation': 85,
      // ...
    }
  }
];
```

**2. Add routing rules** (`src/router/optimizer.ts`):
```typescript
// If provider needs special handling
```

**3. Document** (`docs/API_REFERENCE.md`):
```markdown
### Supported Providers

- Anthropic
- OpenAI
- Google
- **New Provider** - Description
```

---

## Getting Help

Stuck? We're here to help!

1. **Check docs** - Most questions answered in `/docs`
2. **Search issues** - Maybe already answered
3. **Ask in Discussions** - For questions
4. **Join Discord** - Real-time help

---

## Recognition

Contributors are listed in:
- README.md
- GitHub contributors page
- Release notes

Thank you for making OpenCode Flow better! 🙏

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
