import { OpencodeClient, createOpencodeClient } from '@opencode-ai/sdk';
import type {
  Session,
  SessionPromptData,
  SessionCreateData,
  Provider,
  Agent,
  Part,
  AssistantMessage,
  Event
} from '@opencode-ai/sdk';
import { FlowError } from './types.js';
import type { ClientConfig, RetryPolicy } from './types.js';
import pRetry from 'p-retry';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'NETWORK_ERROR']
};

export class FlowClient {
  private client: OpencodeClient;
  private config: Required<ClientConfig>;
  private eventSubscriptions: Set<(event: Event) => void> = new Set();

  constructor(config: ClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      timeout: config.timeout ?? 30000,
      retryPolicy: config.retryPolicy ?? DEFAULT_RETRY_POLICY,
      poolSize: config.poolSize ?? 10
    };

    this.client = createOpencodeClient({
      baseUrl: this.config.baseUrl
    });
  }

  async createSession(options?: SessionCreateData['body']): Promise<Session> {
    return this.withRetry(async () => {
      const response = await this.client.session.create({
        body: options
      });

      if (response.error) {
        throw new FlowError(
          'Failed to create session',
          'SESSION_CREATE_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async getSession(id: string): Promise<Session> {
    return this.withRetry(async () => {
      const response = await this.client.session.get({
        path: { id }
      });

      if (response.error) {
        throw new FlowError(
          `Failed to get session: ${id}`,
          'SESSION_GET_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async deleteSession(id: string): Promise<void> {
    return this.withRetry(async () => {
      const response = await this.client.session.delete({
        path: { id }
      });

      if (response.error) {
        throw new FlowError(
          `Failed to delete session: ${id}`,
          'SESSION_DELETE_FAILED',
          response.error
        );
      }
    });
  }

  async listSessions(): Promise<Session[]> {
    return this.withRetry(async () => {
      const response = await this.client.session.list();

      if (response.error) {
        throw new FlowError(
          'Failed to list sessions',
          'SESSION_LIST_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async sendMessage(
    sessionId: string,
    message: {
      text: string;
      providerID?: string;
      modelID?: string;
      agent?: string;
      system?: string;
      tools?: Record<string, boolean>;
    }
  ): Promise<{ info: AssistantMessage; parts: Part[] }> {
    return this.withRetry(async () => {
      const body: SessionPromptData['body'] = {
        parts: [{ type: 'text', text: message.text }],
        ...(message.providerID && message.modelID && {
          model: {
            providerID: message.providerID,
            modelID: message.modelID
          }
        }),
        ...(message.agent && { agent: message.agent }),
        ...(message.system && { system: message.system }),
        ...(message.tools && { tools: message.tools })
      };

      const response = await this.client.session.prompt({
        path: { id: sessionId },
        body
      });

      if (response.error) {
        throw new FlowError(
          `Failed to send message to session: ${sessionId}`,
          'MESSAGE_SEND_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async getMessages(sessionId: string): Promise<Array<{ info: any; parts: Part[] }>> {
    return this.withRetry(async () => {
      const response = await this.client.session.messages({
        path: { id: sessionId }
      });

      if (response.error) {
        throw new FlowError(
          `Failed to get messages for session: ${sessionId}`,
          'MESSAGES_GET_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async getAgents(): Promise<Agent[]> {
    return this.withRetry(async () => {
      const response = await this.client.app.agents();

      if (response.error) {
        throw new FlowError(
          'Failed to get agents',
          'AGENTS_GET_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async getProviders(): Promise<{ providers: Provider[]; default: Record<string, string> }> {
    return this.withRetry(async () => {
      const response = await this.client.config.providers();

      if (response.error) {
        throw new FlowError(
          'Failed to get providers',
          'PROVIDERS_GET_FAILED',
          response.error
        );
      }

      return response.data!;
    });
  }

  async subscribeToEvents(handler: (event: Event) => void): Promise<() => void> {
    this.eventSubscriptions.add(handler);

    if (this.eventSubscriptions.size === 1) {
      this.startEventStream();
    }

    return () => {
      this.eventSubscriptions.delete(handler);
      if (this.eventSubscriptions.size === 0) {
        this.stopEventStream();
      }
    };
  }

  private eventStreamAbortController?: AbortController;

  private async startEventStream(): Promise<void> {
    this.eventStreamAbortController = new AbortController();

    try {
      const result = await this.client.event.subscribe();

      for await (const event of result.stream) {
        if (this.eventStreamAbortController?.signal.aborted) {
          break;
        }

        this.eventSubscriptions.forEach(handler => {
          try {
            handler(event as Event);
          } catch (error) {
            console.error('Error in event handler:', error);
          }
        });
      }
    } catch (error) {
      if (!this.eventStreamAbortController?.signal.aborted) {
        console.error('Event stream error:', error);
        setTimeout(() => this.startEventStream(), 5000);
      }
    }
  }

  private stopEventStream(): void {
    this.eventStreamAbortController?.abort();
    this.eventStreamAbortController = undefined;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.listSessions();
      return true;
    } catch (error) {
      return false;
    }
  }

  async close(): Promise<void> {
    this.stopEventStream();
    this.eventSubscriptions.clear();
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    return pRetry(fn, {
      retries: this.config.retryPolicy.maxAttempts - 1,
      factor: this.config.retryPolicy.backoffMultiplier,
      minTimeout: this.config.retryPolicy.backoffMs,
      onFailedAttempt: (error) => {
        const isRetryable = this.config.retryPolicy.retryableErrors.some(
          code => error.message.includes(code)
        );

        if (!isRetryable) {
          throw error;
        }

        console.warn(
          `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
        );
      }
    });
  }
}

export function createFlowClient(config: ClientConfig): FlowClient {
  return new FlowClient(config);
}
