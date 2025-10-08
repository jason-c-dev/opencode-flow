import { FlowClient } from './client.js';
import {
  AgentConfig,
  AgentInstance,
  AgentSpawnError,
  FlowError
} from './types.js';
import { EventEmitter } from 'events';

const HEALTH_CHECK_INTERVAL = 10000;
const HEALTH_CHECK_TIMEOUT = 30000;

export class AgentManager extends EventEmitter {
  private agents = new Map<string, AgentInstance>();
  private client: FlowClient;

  constructor(client: FlowClient) {
    super();
    this.client = client;
  }

  async spawn(config: AgentConfig): Promise<AgentInstance> {
    try {
      this.validateConfig(config);

      if (this.agents.has(config.name)) {
        throw new FlowError(
          `Agent with name '${config.name}' already exists`,
          'AGENT_EXISTS',
          { name: config.name }
        );
      }

      const session = await this.client.createSession({
        title: `${config.name}-${Date.now()}`
      });

      if (config.systemPrompt) {
        await this.client.sendMessage(session.id, {
          text: config.systemPrompt,
          providerID: config.provider,
          modelID: config.model,
          agent: config.agent,
          tools: config.tools?.reduce((acc, tool) => {
            acc[tool] = true;
            return acc;
          }, {} as Record<string, boolean>)
        });
      }

      const agent: AgentInstance = {
        name: config.name,
        sessionId: session.id,
        config,
        status: 'idle',
        createdAt: Date.now(),
        lastActivity: Date.now(),
        metrics: {
          tasksCompleted: 0,
          totalCost: 0,
          totalTokens: { input: 0, output: 0 },
          averageLatency: 0
        }
      };

      this.agents.set(config.name, agent);
      this.startHealthCheck(agent);

      this.emit('agent:spawned', agent);

      return agent;
    } catch (error) {
      throw new AgentSpawnError(
        config.name,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async terminate(name: string): Promise<void> {
    const agent = this.agents.get(name);
    
    if (!agent) {
      throw new FlowError(
        `Agent not found: ${name}`,
        'AGENT_NOT_FOUND',
        { name }
      );
    }

    this.stopHealthCheck(agent);

    try {
      await this.client.deleteSession(agent.sessionId);
    } catch (error) {
      console.warn(`Failed to delete session for agent ${name}:`, error);
    }

    this.agents.delete(name);
    this.emit('agent:terminated', name);
  }

  async terminateAll(): Promise<void> {
    const names = Array.from(this.agents.keys());
    await Promise.all(names.map(name => this.terminate(name)));
  }

  get(name: string): AgentInstance | undefined {
    return this.agents.get(name);
  }

  getAll(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  list(): string[] {
    return Array.from(this.agents.keys());
  }

  has(name: string): boolean {
    return this.agents.has(name);
  }

  updateStatus(name: string, status: AgentInstance['status']): void {
    const agent = this.agents.get(name);
    if (agent) {
      agent.status = status;
      agent.lastActivity = Date.now();
    }
  }

  updateMetrics(
    name: string,
    update: {
      cost?: number;
      tokens?: { input: number; output: number };
      latency?: number;
    }
  ): void {
    const agent = this.agents.get(name);
    if (!agent || !agent.metrics) return;

    if (update.cost !== undefined) {
      agent.metrics.totalCost += update.cost;
    }

    if (update.tokens) {
      agent.metrics.totalTokens.input += update.tokens.input;
      agent.metrics.totalTokens.output += update.tokens.output;
    }

    if (update.latency !== undefined) {
      const total = agent.metrics.averageLatency * agent.metrics.tasksCompleted;
      agent.metrics.tasksCompleted += 1;
      agent.metrics.averageLatency = (total + update.latency) / agent.metrics.tasksCompleted;
    }
  }

  async waitForIdle(name: string, timeoutMs: number = 30000): Promise<void> {
    const agent = this.agents.get(name);
    
    if (!agent) {
      throw new FlowError(
        `Agent not found: ${name}`,
        'AGENT_NOT_FOUND',
        { name }
      );
    }

    if (agent.status === 'idle') {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new FlowError(
          `Agent ${name} did not become idle within ${timeoutMs}ms`,
          'WAIT_TIMEOUT',
          { name, timeoutMs }
        ));
      }, timeoutMs);

      const checkStatus = () => {
        if (agent.status === 'idle') {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStatus, 100);
        }
      };

      checkStatus();
    });
  }

  private validateConfig(config: AgentConfig): void {
    if (!config.name) {
      throw new FlowError(
        'Agent name is required',
        'INVALID_CONFIG',
        { field: 'name' }
      );
    }

    if (!config.agent) {
      throw new FlowError(
        'Agent type is required',
        'INVALID_CONFIG',
        { field: 'agent' }
      );
    }

    if (!config.model) {
      throw new FlowError(
        'Model is required',
        'INVALID_CONFIG',
        { field: 'model' }
      );
    }

    if (config.name.includes(' ')) {
      throw new FlowError(
        'Agent name cannot contain spaces',
        'INVALID_CONFIG',
        { field: 'name', value: config.name }
      );
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
      throw new FlowError(
        'Temperature must be between 0 and 1',
        'INVALID_CONFIG',
        { field: 'temperature', value: config.temperature }
      );
    }
  }

  private startHealthCheck(agent: AgentInstance): void {
    const interval = setInterval(async () => {
      try {
        await this.client.getSession(agent.sessionId);
        agent.lastActivity = Date.now();
      } catch (error) {
        console.error(`Health check failed for ${agent.name}:`, error);

        if (Date.now() - agent.lastActivity > HEALTH_CHECK_TIMEOUT) {
          console.warn(`Agent ${agent.name} failed health check, terminating...`);
          clearInterval(interval);
          this.agents.delete(agent.name);
          this.emit('agent:terminated', agent.name);
        }
      }
    }, HEALTH_CHECK_INTERVAL);

    agent.healthCheckInterval = interval;
  }

  private stopHealthCheck(agent: AgentInstance): void {
    if (agent.healthCheckInterval) {
      clearInterval(agent.healthCheckInterval);
      agent.healthCheckInterval = undefined;
    }
  }

  async getSessionMessages(agentName: string): Promise<any[]> {
    const agent = this.agents.get(agentName);
    
    if (!agent) {
      throw new FlowError(
        `Agent not found: ${agentName}`,
        'AGENT_NOT_FOUND',
        { name: agentName }
      );
    }

    const messages = await this.client.getMessages(agent.sessionId);
    return messages;
  }

  getMetrics(agentName?: string): Record<string, any> {
    if (agentName) {
      const agent = this.agents.get(agentName);
      return agent?.metrics || {};
    }

    const allMetrics = {
      totalAgents: this.agents.size,
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      totalTasks: 0,
      byAgent: {} as Record<string, any>
    };

    for (const [name, agent] of this.agents) {
      if (agent.metrics) {
        allMetrics.totalCost += agent.metrics.totalCost;
        allMetrics.totalTokens.input += agent.metrics.totalTokens.input;
        allMetrics.totalTokens.output += agent.metrics.totalTokens.output;
        allMetrics.totalTasks += agent.metrics.tasksCompleted;
        allMetrics.byAgent[name] = agent.metrics;
      }
    }

    return allMetrics;
  }

  async shutdown(): Promise<void> {
    await this.terminateAll();
    this.removeAllListeners();
  }
}
