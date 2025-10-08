import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentManager } from '../../src/core/agent-manager.js';
import { FlowClient } from '../../src/core/client.js';
import { AgentConfig } from '../../src/core/types.js';

describe('AgentManager', () => {
  let mockClient: any;
  let agentManager: AgentManager;

  beforeEach(() => {
    // Create mock FlowClient
    mockClient = {
      createSession: vi.fn().mockResolvedValue({ id: 'test-session-id' }),
      sendMessage: vi.fn().mockResolvedValue({ info: {}, parts: [] }),
      getSession: vi.fn().mockResolvedValue({ id: 'test-session-id' }),
      deleteSession: vi.fn().mockResolvedValue(undefined)
    };

    agentManager = new AgentManager(mockClient as FlowClient);
  });

  describe('spawn', () => {
    it('should spawn an agent with valid config', async () => {
      const config: AgentConfig = {
        name: 'test-agent',
        agent: 'general',
        model: 'claude-sonnet-4'
      };

      const agent = await agentManager.spawn(config);

      expect(agent.name).toBe('test-agent');
      expect(agent.config).toEqual(config);
      expect(agent.status).toBe('idle');
      expect(agent.sessionId).toBe('test-session-id');
      expect(mockClient.createSession).toHaveBeenCalled();
    });

    it('should send system prompt if provided', async () => {
      const config: AgentConfig = {
        name: 'test-agent',
        agent: 'general',
        model: 'claude-sonnet-4',
        systemPrompt: 'You are a helpful assistant'
      };

      await agentManager.spawn(config);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({
          text: 'You are a helpful assistant'
        })
      );
    });

    it('should reject duplicate agent names', async () => {
      const config: AgentConfig = {
        name: 'duplicate',
        agent: 'general',
        model: 'claude-sonnet-4'
      };

      await agentManager.spawn(config);

      await expect(agentManager.spawn(config)).rejects.toThrow('Failed to spawn agent');
    });

    it('should validate required fields', async () => {
      await expect(agentManager.spawn({ name: '', agent: 'general', model: 'test' } as AgentConfig))
        .rejects.toThrow();

      await expect(agentManager.spawn({ name: 'test', agent: '', model: 'test' } as AgentConfig))
        .rejects.toThrow();

      await expect(agentManager.spawn({ name: 'test', agent: 'general', model: '' } as AgentConfig))
        .rejects.toThrow();
    });

    it('should reject names with spaces', async () => {
      await expect(agentManager.spawn({ 
        name: 'invalid name', 
        agent: 'general', 
        model: 'test' 
      } as AgentConfig)).rejects.toThrow();
    });

    it('should validate temperature range', async () => {
      await expect(agentManager.spawn({
        name: 'test1',
        agent: 'general',
        model: 'test',
        temperature: 1.5
      })).rejects.toThrow();

      await expect(agentManager.spawn({
        name: 'test2',
        agent: 'general',
        model: 'test',
        temperature: -0.1
      })).rejects.toThrow();
    });

    it('should initialize metrics', async () => {
      const agent = await agentManager.spawn({
        name: 'test',
        agent: 'general',
        model: 'test'
      });

      expect(agent.metrics).toBeDefined();
      expect(agent.metrics?.tasksCompleted).toBe(0);
      expect(agent.metrics?.totalCost).toBe(0);
      expect(agent.metrics?.totalTokens).toEqual({ input: 0, output: 0 });
    });
  });

  describe('terminate', () => {
    it('should terminate an existing agent', async () => {
      await agentManager.spawn({ name: 'test', agent: 'general', model: 'test' });
      
      await agentManager.terminate('test');

      expect(agentManager.get('test')).toBeUndefined();
      expect(mockClient.deleteSession).toHaveBeenCalledWith('test-session-id');
    });

    it('should throw error for non-existent agent', async () => {
      await expect(agentManager.terminate('does-not-exist'))
        .rejects.toThrow('Agent not found');
    });
  });

  describe('terminateAll', () => {
    it('should terminate all agents', async () => {
      await agentManager.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await agentManager.spawn({ name: 'agent2', agent: 'general', model: 'test' });
      await agentManager.spawn({ name: 'agent3', agent: 'general', model: 'test' });

      expect(agentManager.list()).toHaveLength(3);

      await agentManager.terminateAll();

      expect(agentManager.list()).toHaveLength(0);
    });
  });

  describe('get and list', () => {
    it('should get agent by name', async () => {
      const spawned = await agentManager.spawn({ name: 'test', agent: 'general', model: 'test' });
      const retrieved = agentManager.get('test');

      expect(retrieved).toEqual(spawned);
    });

    it('should return undefined for non-existent agent', () => {
      expect(agentManager.get('does-not-exist')).toBeUndefined();
    });

    it('should list all agent names', async () => {
      await agentManager.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await agentManager.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      const list = agentManager.list();
      expect(list).toEqual(['agent1', 'agent2']);
    });

    it('should get all agent instances', async () => {
      await agentManager.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await agentManager.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      const all = agentManager.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('agent1');
      expect(all[1].name).toBe('agent2');
    });
  });

  describe('updateStatus', () => {
    it('should update agent status', async () => {
      await agentManager.spawn({ name: 'test', agent: 'general', model: 'test' });

      agentManager.updateStatus('test', 'busy');
      expect(agentManager.get('test')?.status).toBe('busy');

      agentManager.updateStatus('test', 'error');
      expect(agentManager.get('test')?.status).toBe('error');

      agentManager.updateStatus('test', 'idle');
      expect(agentManager.get('test')?.status).toBe('idle');
    });
  });

  describe('updateMetrics', () => {
    it('should update agent metrics', async () => {
      await agentManager.spawn({ name: 'test', agent: 'general', model: 'test' });

      agentManager.updateMetrics('test', {
        cost: 0.05,
        tokens: { input: 100, output: 50 },
        latency: 2000
      });

      const agent = agentManager.get('test');
      expect(agent?.metrics?.totalCost).toBe(0.05);
      expect(agent?.metrics?.totalTokens).toEqual({ input: 100, output: 50 });
      expect(agent?.metrics?.tasksCompleted).toBe(1);
      expect(agent?.metrics?.averageLatency).toBe(2000);
    });

    it('should accumulate metrics across multiple updates', async () => {
      await agentManager.spawn({ name: 'test', agent: 'general', model: 'test' });

      agentManager.updateMetrics('test', { cost: 0.05, tokens: { input: 100, output: 50 }, latency: 2000 });
      agentManager.updateMetrics('test', { cost: 0.03, tokens: { input: 80, output: 40 }, latency: 1500 });

      const agent = agentManager.get('test');
      expect(agent?.metrics?.totalCost).toBe(0.08);
      expect(agent?.metrics?.totalTokens).toEqual({ input: 180, output: 90 });
      expect(agent?.metrics?.tasksCompleted).toBe(2);
      expect(agent?.metrics?.averageLatency).toBe(1750); // (2000 + 1500) / 2
    });
  });

  describe('getMetrics', () => {
    it('should get metrics for specific agent', async () => {
      await agentManager.spawn({ name: 'test', agent: 'general', model: 'test' });
      agentManager.updateMetrics('test', { cost: 0.05, tokens: { input: 100, output: 50 } });

      const metrics = agentManager.getMetrics('test');
      expect(metrics.totalCost).toBe(0.05);
      expect(metrics.totalTokens).toEqual({ input: 100, output: 50 });
    });

    it('should get aggregated metrics for all agents', async () => {
      await agentManager.spawn({ name: 'agent1', agent: 'general', model: 'test' });
      await agentManager.spawn({ name: 'agent2', agent: 'general', model: 'test' });

      agentManager.updateMetrics('agent1', { cost: 0.05, tokens: { input: 100, output: 50 }, latency: 1000 });
      agentManager.updateMetrics('agent2', { cost: 0.03, tokens: { input: 80, output: 40 }, latency: 1000 });

      const metrics = agentManager.getMetrics();
      expect(metrics.totalAgents).toBe(2);
      expect(metrics.totalCost).toBe(0.08);
      expect(metrics.totalTokens).toEqual({ input: 180, output: 90 });
      expect(metrics.totalTasks).toBe(2);
    });
  });
});
