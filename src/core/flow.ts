import { EventEmitter } from 'events';
import { FlowClient } from './client.js';
import { AgentManager } from './agent-manager.js';
import {
  FlowConfig,
  AgentConfig,
  AgentInstance,
  TaskExecution,
  ExecutionResult,
  FlowMemory,
  MemoryBackend,
  FlowError,
  TaskExecutionError
} from './types.js';
import { FileMemoryBackend } from './memory.js';

const DEFAULT_SERVER_URL = 'http://localhost:4096';

export class FlowOrchestrator extends EventEmitter {
  private client: FlowClient;
  private agentManager: AgentManager;
  private memoryBackend: MemoryBackend;
  private config: FlowConfig;

  constructor(config: FlowConfig = {}) {
    super();
    this.config = config;

    this.client = new FlowClient({
      baseUrl: config.serverUrl || DEFAULT_SERVER_URL,
      retryPolicy: config.retryPolicy
    });

    this.agentManager = new AgentManager(this.client);

    this.memoryBackend = this.initializeMemory(config.memory);

    this.agentManager.on('agent:spawned', (agent) => {
      this.emit('agent:spawned', agent);
    });

    this.agentManager.on('agent:terminated', (name) => {
      this.emit('agent:terminated', name);
    });
  }

  async spawn(config: AgentConfig): Promise<AgentInstance> {
    return this.agentManager.spawn(config);
  }

  async terminate(agentName: string): Promise<void> {
    return this.agentManager.terminate(agentName);
  }

  async terminateAll(): Promise<void> {
    return this.agentManager.terminateAll();
  }

  get(agentName: string): AgentInstance | undefined {
    return this.agentManager.get(agentName);
  }

  getAll(): AgentInstance[] {
    return this.agentManager.getAll();
  }

  list(): string[] {
    return this.agentManager.list();
  }

  get memory(): FlowMemory {
    return {
      set: (key: string, value: any, ttl?: number) => this.memoryBackend.set(key, value, ttl),
      get: (key: string) => this.memoryBackend.get(key),
      delete: (key: string) => this.memoryBackend.delete(key),
      list: () => this.memoryBackend.listKeys(),
      clear: () => this.memoryBackend.clear()
    };
  }

  async execute(execution: TaskExecution): Promise<ExecutionResult[]> {
    const mode = execution.mode || 'parallel';

    this.emit('task:started', { task: execution.task, agents: execution.agents, mode });

    try {
      let results: ExecutionResult[];

      switch (mode) {
        case 'parallel':
          results = await this.executeParallel(execution.task, execution.agents, execution.timeout);
          break;
        case 'sequential':
          results = await this.executeSequential(execution.task, execution.agents, execution.timeout);
          break;
        case 'hierarchical':
          if (execution.agents.length < 2) {
            throw new FlowError(
              'Hierarchical mode requires at least 2 agents (1 coordinator + 1 worker)',
              'INVALID_EXECUTION',
              { mode: 'hierarchical', agentCount: execution.agents.length }
            );
          }
          const coordinator = execution.agents[0];
          const workers = execution.agents.slice(1);
          const result = await this.executeHierarchical(execution.task, coordinator, workers, execution.timeout);
          results = [result];
          break;
        default:
          throw new FlowError(
            `Unknown execution mode: ${mode}`,
            'INVALID_EXECUTION',
            { mode }
          );
      }

      this.emit('task:completed', results);
      return results;
    } catch (error) {
      this.emit('task:failed', error);
      throw error;
    }
  }

  async executeParallel(task: string, agents: string[], timeout?: number): Promise<ExecutionResult[]> {
    this.validateAgents(agents);

    const startTime = Date.now();

    const promises = agents.map(async (agentName) => {
      const agent = this.agentManager.get(agentName);
      if (!agent) {
        throw new FlowError(`Agent not found: ${agentName}`, 'AGENT_NOT_FOUND', { name: agentName });
      }

      this.agentManager.updateStatus(agentName, 'busy');

      try {
        const taskStartTime = Date.now();
        const result = await this.client.sendMessage(agent.sessionId, {
          text: task,
          providerID: agent.config.provider,
          modelID: agent.config.model,
          agent: agent.config.agent,
          tools: agent.config.tools?.reduce((acc, tool) => {
            acc[tool] = true;
            return acc;
          }, {} as Record<string, boolean>)
        });

        const duration = Date.now() - taskStartTime;
        const cost = result.info.cost || 0;
        const tokensUsed = {
          input: result.info.tokens?.input || 0,
          output: result.info.tokens?.output || 0
        };

        this.agentManager.updateMetrics(agentName, {
          cost,
          tokens: tokensUsed,
          latency: duration
        });

        this.agentManager.updateStatus(agentName, 'idle');

        return {
          agent: agentName,
          status: 'fulfilled' as const,
          output: result,
          duration,
          cost,
          tokensUsed
        };
      } catch (error) {
        this.agentManager.updateStatus(agentName, 'error');
        throw new TaskExecutionError(task, agentName, error instanceof Error ? error : new Error(String(error)));
      }
    });

    const results = await Promise.allSettled(promises);

    return results.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          agent: agents[idx],
          status: 'rejected' as const,
          error: result.reason,
          duration: Date.now() - startTime,
          cost: 0,
          tokensUsed: { input: 0, output: 0 }
        };
      }
    });
  }

  async executeSequential(task: string, agents: string[], timeout?: number): Promise<ExecutionResult[]> {
    this.validateAgents(agents);

    const results: ExecutionResult[] = [];
    let contextualTask = task;

    for (const agentName of agents) {
      const agent = this.agentManager.get(agentName);
      if (!agent) {
        throw new FlowError(`Agent not found: ${agentName}`, 'AGENT_NOT_FOUND', { name: agentName });
      }

      this.agentManager.updateStatus(agentName, 'busy');

      try {
        const augmentedTask = results.length > 0
          ? `${contextualTask}\n\nPrevious agent results:\n${this.formatResults(results)}`
          : contextualTask;

        const taskStartTime = Date.now();
        const result = await this.client.sendMessage(agent.sessionId, {
          text: augmentedTask,
          providerID: agent.config.provider,
          modelID: agent.config.model,
          agent: agent.config.agent,
          tools: agent.config.tools?.reduce((acc, tool) => {
            acc[tool] = true;
            return acc;
          }, {} as Record<string, boolean>)
        });

        const duration = Date.now() - taskStartTime;
        const cost = result.info.cost || 0;
        const tokensUsed = {
          input: result.info.tokens?.input || 0,
          output: result.info.tokens?.output || 0
        };

        this.agentManager.updateMetrics(agentName, {
          cost,
          tokens: tokensUsed,
          latency: duration
        });

        await this.memory.set(`${agentName}_result`, result);

        const executionResult: ExecutionResult = {
          agent: agentName,
          status: 'fulfilled',
          output: result,
          duration,
          cost,
          tokensUsed
        };

        results.push(executionResult);

        this.agentManager.updateStatus(agentName, 'idle');
      } catch (error) {
        this.agentManager.updateStatus(agentName, 'error');
        
        const executionResult: ExecutionResult = {
          agent: agentName,
          status: 'rejected',
          error: error instanceof Error ? error : new Error(String(error)),
          duration: 0,
          cost: 0,
          tokensUsed: { input: 0, output: 0 }
        };

        results.push(executionResult);
        break;
      }
    }

    return results;
  }

  async executeHierarchical(
    task: string,
    coordinator: string,
    workers: string[],
    timeout?: number
  ): Promise<ExecutionResult> {
    this.validateAgents([coordinator, ...workers]);

    const coordinatorAgent = this.agentManager.get(coordinator);
    if (!coordinatorAgent) {
      throw new FlowError(`Coordinator agent not found: ${coordinator}`, 'AGENT_NOT_FOUND', { name: coordinator });
    }

    this.agentManager.updateStatus(coordinator, 'busy');

    try {
      const coordinationPrompt = `
You are coordinating a task with the following workers: ${workers.join(', ')}

Task: ${task}

Please break down this task into subtasks for each worker. Store your plan in shared memory using the key 'coordination_plan'.
Then, instruct each worker on their specific subtask.
`;

      const taskStartTime = Date.now();
      const planResult = await this.client.sendMessage(coordinatorAgent.sessionId, {
        text: coordinationPrompt,
        providerID: coordinatorAgent.config.provider,
        modelID: coordinatorAgent.config.model,
        agent: coordinatorAgent.config.agent
      });

      const workerResults = await this.executeParallel(
        `Execute the subtask assigned to you by the coordinator for the main task: ${task}`,
        workers,
        timeout
      );

      const aggregationPrompt = `
Based on the following worker results, provide a final consolidated answer to the original task.

Original task: ${task}

Worker results:
${this.formatResults(workerResults)}

Please provide a comprehensive final result.
`;

      const finalResult = await this.client.sendMessage(coordinatorAgent.sessionId, {
        text: aggregationPrompt,
        providerID: coordinatorAgent.config.provider,
        modelID: coordinatorAgent.config.model,
        agent: coordinatorAgent.config.agent
      });

      const duration = Date.now() - taskStartTime;
      const totalCost = (planResult.info.cost || 0) + (finalResult.info.cost || 0) + 
        workerResults.reduce((sum, r) => sum + r.cost, 0);
      const totalTokens = {
        input: (planResult.info.tokens?.input || 0) + (finalResult.info.tokens?.input || 0) +
          workerResults.reduce((sum, r) => sum + r.tokensUsed.input, 0),
        output: (planResult.info.tokens?.output || 0) + (finalResult.info.tokens?.output || 0) +
          workerResults.reduce((sum, r) => sum + r.tokensUsed.output, 0)
      };

      this.agentManager.updateMetrics(coordinator, {
        cost: totalCost,
        tokens: totalTokens,
        latency: duration
      });

      this.agentManager.updateStatus(coordinator, 'idle');

      return {
        agent: coordinator,
        status: 'fulfilled',
        output: finalResult,
        duration,
        cost: totalCost,
        tokensUsed: totalTokens
      };
    } catch (error) {
      this.agentManager.updateStatus(coordinator, 'error');
      throw new TaskExecutionError(
        task,
        coordinator,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async waitForAgent(agentName: string, timeoutMs?: number): Promise<void> {
    return this.agentManager.waitForIdle(agentName, timeoutMs);
  }

  getMetrics(agentName?: string): Record<string, any> {
    return this.agentManager.getMetrics(agentName);
  }

  async shutdown(): Promise<void> {
    await this.agentManager.shutdown();
    await this.client.close();
    await this.memory.clear();
    this.removeAllListeners();
  }

  private validateAgents(agents: string[]): void {
    if (!agents || agents.length === 0) {
      throw new FlowError('At least one agent is required', 'INVALID_EXECUTION', { agents });
    }

    for (const agentName of agents) {
      if (!this.agentManager.has(agentName)) {
        throw new FlowError(`Agent not found: ${agentName}`, 'AGENT_NOT_FOUND', { name: agentName });
      }
    }
  }

  private formatResults(results: ExecutionResult[]): string {
    return results
      .map((r, idx) => {
        if (r.status === 'fulfilled' && r.output) {
          const textParts = r.output.parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n');
          return `Agent ${r.agent}:\n${textParts}`;
        } else {
          return `Agent ${r.agent}: [Error: ${r.error?.message || 'Unknown error'}]`;
        }
      })
      .join('\n\n---\n\n');
  }

  private initializeMemory(config?: FlowConfig['memory']): MemoryBackend {
    if (!config) {
      return new FileMemoryBackend();
    }

    if (config.backend === 'custom' && config.customBackend) {
      return config.customBackend;
    }

    if (config.backend === 'file') {
      return new FileMemoryBackend(config.path);
    }

    if (config.backend === 'redis') {
      throw new FlowError(
        'Redis backend not yet implemented',
        'NOT_IMPLEMENTED',
        { backend: 'redis' }
      );
    }

    return new FileMemoryBackend();
  }
}
