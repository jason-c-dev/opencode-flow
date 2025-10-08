# Session Context for OpenCode Flow

**Use this file to quickly get context in new sessions.**

---

## Project Quick Facts

- **Name:** OpenCode Flow
- **Purpose:** Multi-agent orchestration framework built on OpenCode
- **Repository:** https://github.com/jason-c-dev/opencode-flow
- **Local Path:** `/Users/jason/dev/opencode-flow`
- **Status:** Planning Complete ✅ → Starting Implementation

---

## Current Phase: Phase 1 (MVP - Week 1-2)

### Goals
Build interactive setup wizard and basic orchestration:

**Priority 1: Setup Wizard** (`opencode-flow setup`)
- [ ] CLI command structure (`src/cli/setup.ts`)
- [ ] OpenCode CLI detection/installation
- [ ] Server lifecycle management
- [ ] API key configuration wizard
- [ ] Health check validation
- [ ] `.env` file generation

**Priority 2: Core Components**
- [ ] FlowClient - OpenCode HTTP API wrapper (`src/core/client.ts`)
- [ ] AgentManager - Agent lifecycle management (`src/core/agent-manager.ts`)
- [ ] FlowOrchestrator - Multi-agent coordination (`src/core/flow.ts`)

**Priority 3: Basic CLI**
- [ ] `opencode-flow spawn` command
- [ ] `opencode-flow exec` command
- [ ] `opencode-flow list` command

**Deliverable:** Zero-config setup + spawn 3+ agents, execute tasks in parallel

---

## Key Documentation Files

Read these for context (in order):

1. **START_HERE.md** - Project overview, what's done, what's next
2. **docs/PROJECT_SUMMARY.md** - Complete roadmap with all phases
3. **docs/PROJECT_SPEC.md** - Architecture, goals, technical specs
4. **docs/IMPLEMENTATION_DESIGN.md** - Detailed component design
5. **docs/API_REFERENCE.md** - API specifications (CLI, programmatic, HTTP)

---

## Project Structure

```
opencode-flow/
├── docs/                    # Complete specifications
│   ├── PROJECT_SPEC.md
│   ├── PROJECT_SUMMARY.md
│   ├── IMPLEMENTATION_DESIGN.md
│   ├── API_REFERENCE.md
│   └── GETTING_STARTED.md
├── src/                     # 🔨 Implementation goes here
│   ├── cli/
│   │   ├── index.ts         # Main CLI entry
│   │   └── setup.ts         # Setup wizard (TODO)
│   ├── core/
│   │   ├── types.ts         # ✅ Type definitions
│   │   ├── client.ts        # TODO: FlowClient
│   │   ├── flow.ts          # TODO: FlowOrchestrator
│   │   └── agent-manager.ts # TODO: AgentManager
│   ├── router/
│   │   ├── optimizer.ts     # TODO: Model router
│   │   └── providers.ts     # TODO: Provider configs
│   └── tools/
│       └── flow-memory.ts   # TODO: MCP memory tool
├── tests/                   # TODO: Test suite
├── package.json             # ✅ Complete
├── tsconfig.json            # ✅ Complete
└── README.md                # ✅ Complete
```

---

## Technology Stack

- **Language:** TypeScript 5.3+
- **Runtime:** Node.js 20+
- **Build:** tsup
- **Testing:** Vitest
- **CLI:** commander + chalk + ora
- **Validation:** zod
- **Dependencies:**
  - `@opencode-ai/sdk` - OpenCode HTTP API client
  - `commander` - CLI framework
  - `chalk` + `ora` - Terminal UI
  - `zod` - Schema validation
  - `p-retry` + `p-queue` - Async utilities

---

## Key Architectural Decisions

### 1. Wrapper, Not Fork
OpenCode Flow is a **lightweight wrapper** around OpenCode's HTTP server API. We don't replace OpenCode; we add multi-agent orchestration on top.

### 2. Setup Wizard First
The interactive setup wizard (`opencode-flow setup`) eliminates the chicken-and-egg problem:
- Auto-installs OpenCode CLI if needed
- Starts OpenCode server in background
- Configures API keys interactively
- Validates everything works

### 3. Three Deployment Modes
- **Local:** Direct Node.js execution (development)
- **Docker:** Containerized (CI/CD, production)
- **Flow Nexus:** Cloud sandboxes (scalable production)

### 4. Cost Optimization via Model Router
Automatically route tasks to optimal models:
- Simple tasks → Gemini 2.5 Flash (99% cheaper)
- Code reviews → DeepSeek R1 (85% cheaper)
- Production code → Claude Sonnet 4 (highest quality)

---

## Environment Variables

```bash
# OpenCode Server
OPENCODE_SERVER_URL=http://localhost:4096

# LLM Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-v1-...
GOOGLE_API_KEY=...

# Flow Configuration
FLOW_MODE=development
FLOW_LOG_LEVEL=info
FLOW_MEMORY_BACKEND=file
FLOW_MEMORY_PATH=./.flow-memory

# Model Router
ROUTER_MODE=balanced
ROUTER_MAX_COST=0.5
```

---

## Next Session Quick Start

Copy-paste this into your next session:

```
I'm continuing work on OpenCode Flow. 

Context:
- Repo: https://github.com/jason-c-dev/opencode-flow
- Local: /Users/jason/dev/opencode-flow
- Please read: SESSION_CONTEXT.md

Current task: Implement Phase 1 MVP
Next step: Build interactive setup wizard (opencode-flow setup)

What should we implement first?
```

---

## Recent Changes (Session History)

### Session 1 (2025-01-07)
- ✅ Created complete project specifications (25,000+ words)
- ✅ Renamed from opencode-swarm → opencode-flow
- ✅ Added interactive setup wizard to Phase 1
- ✅ Updated all documentation
- ✅ Pushed to GitHub: 3 commits

**Files modified:**
- All docs updated with "flow" terminology
- Added setup wizard specs
- Fixed environment variables (SWARM_* → FLOW_*)

**Commits:**
1. `b73011a` - Initial project setup
2. `651d112` - Rename to opencode-flow
3. `923eb1b` - Add setup wizard and docs

---

## Git Workflow

```bash
# Check status
cd /Users/jason/dev/opencode-flow
git status

# Make changes, then:
git add -A
git commit -m "feat: implement setup wizard"
git push origin main
```

---

## Troubleshooting Common Context Issues

**If you're confused about architecture:**
→ Read `docs/IMPLEMENTATION_DESIGN.md`

**If you're confused about what to build:**
→ Read `docs/PROJECT_SUMMARY.md` Phase 1 checklist

**If you're confused about API design:**
→ Read `docs/API_REFERENCE.md`

**If you need quick overview:**
→ Read `START_HERE.md`

---

## Success Criteria (Phase 1)

- [ ] User runs `opencode-flow setup` → Everything works
- [ ] User can spawn 3+ agents programmatically
- [ ] User can execute tasks in parallel
- [ ] CLI has 5+ working commands
- [ ] Tests pass
- [ ] Documentation matches implementation

**Target:** MVP complete in 2 weeks
