import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowOrchestrator } from '../../src/core/flow.js';
import { FlowClient } from '../../src/core/client.js';

describe('FlowOrchestrator Integration', () => {
  let orchestrator: FlowOrchestrator;
  let mockClient: any;

  beforeEach(() => {
    // Mock FlowClient
    mockClient = {
      createSession: vi.fn().mockImplementation(() => 
        Promise.resolve({ id: `session-${Math.random()}` })
      ),
      sendMessage: vi.fn().mockImplementation(() =>
        Promise.resolve({
          info: { cost: 0.01, tokens: { input: 100, output: 50 } },
          parts: [{ type: 'text', text: 'Mock response' }]
        })
      ),
      getSession: vi.fn().mockResolvedValue({ id: 'test-session' }),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      healthCheck: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined)
    };

    // Create orchestrator with mocked client
    orchestrator = new FlowOrchestrator({
      serverUrl: 'http://localhost:4096'
    });
    
    // Replace the client with our mock
    (orchestrator as any).client = mockClient;
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  describe('Agent Lifecycle', () => {
    it('should spawn and terminate agents', async () => {
      const agent = await orchestrator.spawn({
        name: 'test-agent',
        agent: 'general',
        model: 'claude-sonnet-4'
      });

      expect(agent.name).toBe('test-agent');
      expect(orchestrator.list()).toContain('test-agent');

      await orchestrator.terminate('test-agent');
      expect(orchestrator.list()).not.toContain('test-agent');
    });

    it('should spawn multiple agents', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'build', model: 'test' });
      await orchestrator.spawn({ name: 'agent3', agent: 'plan', model: 'test' });

      expect(orchestrator.list()).toHaveLength(3);
      expect(orchestrator.getAll()).toHaveLength(3);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute task in parallel across multiple agents', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent3', agent: 'general', model: 'test' });

      const results = await orchestrator.execute({
        task: 'Test task',
        agents: ['agent1', 'agent2', 'agent3'],
        mode: 'parallel'
      });

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in parallel execution', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      // Make one agent fail
      mockClient.sendMessage
        .mockResolvedValueOnce({
          info: { cost: 0.01, tokens: { input: 100, output: 50 } },
          parts: [{ type: 'text', text: 'Success' }]
        })
        .mockRejectedValueOnce(new Error('Agent error'));

      const results = await orchestrator.execute({
        task: 'Test task',
        agents: ['agent1', 'agent2'],
        mode: 'parallel'
      });

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
    });
  });

  describe('Sequential Execution', () => {
    it('should execute task sequentially with context passing', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      const results = await orchestrator.execute({
        task: 'Test task',
        agents: ['agent1', 'agent2'],
        mode: 'sequential'
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
      
      // Second call should include previous results
      const secondCall = mockClient.sendMessage.mock.calls[1][1];
      expect(secondCall.text).toContain('Previous agent results');
    });

    it('should stop sequential execution on first error', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent3', agent: 'general', model: 'test' });

      mockClient.sendMessage
        .mockResolvedValueOnce({
          info: { cost: 0.01, tokens: { input: 100, output: 50 } },
          parts: [{ type: 'text', text: 'Success' }]
        })
        .mockRejectedValueOnce(new Error('Agent error'));

      const results = await orchestrator.execute({
        task: 'Test task',
        agents: ['agent1', 'agent2', 'agent3'],
        mode: 'sequential'
      });

      // Should only have 2 results (stopped after second failed)
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
    });
  });

  describe('Hierarchical Execution', () => {
    it('should execute with coordinator and workers', async () => {
      await orchestrator.spawn({ name: 'coordinator', agent: 'plan', model: 'test' });
      await orchestrator.spawn({ name: 'worker1', agent: 'build', model: 'test' });
      await orchestrator.spawn({ name: 'worker2', agent: 'build', model: 'test' });

      const result = await orchestrator.execute({
        task: 'Complex task',
        agents: ['coordinator', 'worker1', 'worker2'],
        mode: 'hierarchical'
      });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('fulfilled');
      expect(result[0].agent).toBe('coordinator');
      
      // Coordinator should be called twice (planning + aggregation) + 2 workers
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(4);
    });

    it('should require at least 2 agents for hierarchical mode', async () => {
      await orchestrator.spawn({ name: 'coordinator', agent: 'plan', model: 'test' });

      await expect(orchestrator.execute({
        task: 'Task',
        agents: ['coordinator'],
        mode: 'hierarchical'
      })).rejects.toThrow('at least 2 agents');
    });
  });

  describe('Memory Integration', () => {
    it('should allow agents to share data via memory', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });

      // Store data
      await orchestrator.memory.set('shared-data', { value: 'test' });

      // Retrieve data
      const data = await orchestrator.memory.get('shared-data');
      expect(data).toEqual({ value: 'test' });

      // List keys
      const keys = await orchestrator.memory.list();
      expect(keys).toContain('shared-data');

      // Delete
      await orchestrator.memory.delete('shared-data');
      expect(await orchestrator.memory.get('shared-data')).toBeNull();
    });

    it('should store results in memory during sequential execution', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      await orchestrator.execute({
        task: 'Test task',
        agents: ['agent1', 'agent2'],
        mode: 'sequential'
      });

      // Check if results were stored
      const agent1Result = await orchestrator.memory.get('agent1_result');
      const agent2Result = await orchestrator.memory.get('agent2_result');

      expect(agent1Result).toBeDefined();
      expect(agent2Result).toBeDefined();
    });
  });

  describe('Metrics Tracking', () => {
    it('should track costs and tokens across executions', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });

      await orchestrator.execute({
        task: 'Task 1',
        agents: ['agent1'],
        mode: 'parallel'
      });

      await orchestrator.execute({
        task: 'Task 2',
        agents: ['agent1'],
        mode: 'parallel'
      });

      const metrics = orchestrator.getMetrics('agent1');
      expect(metrics.tasksCompleted).toBe(2);
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.totalTokens.input).toBeGreaterThan(0);
      expect(metrics.totalTokens.output).toBeGreaterThan(0);
    });

    it('should aggregate metrics across all agents', async () => {
      await orchestrator.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await orchestrator.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      await orchestrator.execute({
        task: 'Test task',
        agents: ['agent1', 'agent2'],
        mode: 'parallel'
      });

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalAgents).toBe(2);
      expect(metrics.totalTasks).toBe(2);
      expect(metrics.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent agent', async () => {
      await expect(orchestrator.execute({
        task: 'Test',
        agents: ['non-existent'],
        mode: 'parallel'
      })).rejects.toThrow('Agent not found');
    });

    it('should throw error for empty agent list', async () => {
      await expect(orchestrator.execute({
        task: 'Test',
        agents: [],
        mode: 'parallel'
      })).rejects.toThrow('At least one agent is required');
    });

    it('should emit task:failed event on error', async () => {
      const errorHandler = vi.fn();
      orchestrator.on('task:failed', errorHandler);

      await expect(orchestrator.execute({
        task: 'Test',
        agents: ['non-existent'],
        mode: 'parallel'
      })).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Event System', () => {
    it('should emit agent:spawned event', async () => {
      const handler = vi.fn();
      orchestrator.on('agent:spawned', handler);

      await orchestrator.spawn({ name: 'test', agent: 'general', model: 'test' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test' })
      );
    });

    it('should emit agent:terminated event', async () => {
      const handler = vi.fn();
      orchestrator.on('agent:terminated', handler);

      await orchestrator.spawn({ name: 'test', agent: 'general', model: 'test' });
      await orchestrator.terminate('test');

      expect(handler).toHaveBeenCalledWith('test');
    });

    it('should emit task lifecycle events', async () => {
      const startHandler = vi.fn();
      const completeHandler = vi.fn();

      orchestrator.on('task:started', startHandler);
      orchestrator.on('task:completed', completeHandler);

      await orchestrator.spawn({ name: 'test', agent: 'general', model: 'test' });
      await orchestrator.execute({
        task: 'Test',
        agents: ['test'],
        mode: 'parallel'
      });

      expect(startHandler).toHaveBeenCalled();
      expect(completeHandler).toHaveBeenCalled();
    });
  });
});
