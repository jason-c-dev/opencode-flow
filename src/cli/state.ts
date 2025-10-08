import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { FlowOrchestrator } from '../core/flow.js';
import { FlowConfig } from '../core/types.js';

const STATE_DIR = path.join(homedir(), '.opencode-flow');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

interface CLIState {
  serverUrl: string;
  agents: Array<{
    name: string;
    agent: string;
    model: string;
    provider?: string;
    sessionId: string;
    createdAt: number;
  }>;
}

let orchestrator: FlowOrchestrator | null = null;

export async function initializeOrchestrator(): Promise<FlowOrchestrator> {
  if (orchestrator) {
    return orchestrator;
  }

  const state = await loadState();
  
  const config: FlowConfig = {
    serverUrl: state.serverUrl || process.env.OPENCODE_SERVER_URL || 'http://localhost:4096'
  };

  orchestrator = new FlowOrchestrator(config);
  
  return orchestrator;
}

export function getOrchestrator(): FlowOrchestrator {
  if (!orchestrator) {
    throw new Error('Orchestrator not initialized. Run a command first.');
  }
  return orchestrator;
}

export async function loadState(): Promise<CLIState> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      serverUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:4096',
      agents: []
    };
  }
}

export async function saveState(state: Partial<CLIState>): Promise<void> {
  const current = await loadState();
  const updated = { ...current, ...state };
  
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
}

export async function addAgentToState(agent: {
  name: string;
  agent: string;
  model: string;
  provider?: string;
  sessionId: string;
}): Promise<void> {
  const state = await loadState();
  
  const existing = state.agents.findIndex(a => a.name === agent.name);
  if (existing >= 0) {
    state.agents[existing] = { ...agent, createdAt: Date.now() };
  } else {
    state.agents.push({ ...agent, createdAt: Date.now() });
  }
  
  await saveState(state);
}

export async function removeAgentFromState(name: string): Promise<void> {
  const state = await loadState();
  state.agents = state.agents.filter(a => a.name !== name);
  await saveState(state);
}

export async function clearState(): Promise<void> {
  await saveState({ agents: [] });
}
