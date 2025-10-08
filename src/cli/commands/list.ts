import chalk from 'chalk';
import ora from 'ora';
import { initializeOrchestrator } from '../state.js';

interface ListOptions {
  json?: boolean;
  verbose?: boolean;
}

export async function list(options: ListOptions): Promise<void> {
  const spinner = ora('Loading agents...').start();

  try {
    const orchestrator = await initializeOrchestrator();
    const agents = orchestrator.getAll();

    spinner.stop();

    if (agents.length === 0) {
      console.log(chalk.yellow('No active agents found.'));
      console.log(chalk.dim('\nUse `opencode-flow spawn` to create an agent.'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold(`Active Agents (${agents.length}):`));
    console.log();

    if (options.verbose) {
      for (const agent of agents) {
        console.log(chalk.bold.cyan(`${agent.name}`));
        console.log(chalk.gray('  Type:         ') + agent.config.agent);
        console.log(chalk.gray('  Model:        ') + agent.config.model);
        console.log(chalk.gray('  Provider:     ') + (agent.config.provider || 'default'));
        console.log(chalk.gray('  Status:       ') + getStatusColor(agent.status));
        console.log(chalk.gray('  Session ID:   ') + chalk.dim(agent.sessionId));
        console.log(chalk.gray('  Created:      ') + new Date(agent.createdAt).toLocaleString());
        console.log(chalk.gray('  Last Active:  ') + new Date(agent.lastActivity).toLocaleString());
        
        if (agent.metrics) {
          console.log(chalk.gray('  Tasks:        ') + agent.metrics.tasksCompleted);
          console.log(chalk.gray('  Total Cost:   ') + chalk.yellow(`$${agent.metrics.totalCost.toFixed(4)}`));
          console.log(chalk.gray('  Total Tokens: ') + (agent.metrics.totalTokens.input + agent.metrics.totalTokens.output).toLocaleString());
          console.log(chalk.gray('  Avg Latency:  ') + `${(agent.metrics.averageLatency / 1000).toFixed(2)}s`);
        }
        
        console.log();
      }
    } else {
      const maxNameLen = Math.max(...agents.map((a: any) => a.name.length), 'NAME'.length);
      const maxAgentLen = Math.max(...agents.map((a: any) => a.config.agent.length), 'AGENT'.length);
      const maxModelLen = Math.max(...agents.map((a: any) => a.config.model.length), 'MODEL'.length);

      console.log(
        chalk.bold('NAME'.padEnd(maxNameLen + 2)) +
        chalk.bold('AGENT'.padEnd(maxAgentLen + 2)) +
        chalk.bold('MODEL'.padEnd(maxModelLen + 2)) +
        chalk.bold('STATUS'.padEnd(10)) +
        chalk.bold('SESSION')
      );

      console.log(chalk.gray('─'.repeat(maxNameLen + maxAgentLen + maxModelLen + 32)));

      for (const agent of agents) {
        console.log(
          chalk.cyan(agent.name.padEnd(maxNameLen + 2)) +
          agent.config.agent.padEnd(maxAgentLen + 2) +
          agent.config.model.padEnd(maxModelLen + 2) +
          getStatusColor(agent.status).padEnd(10) +
          chalk.dim(agent.sessionId.substring(0, 8))
        );
      }
    }

    console.log();
    const metrics = orchestrator.getMetrics();
    console.log(chalk.bold('Overall Statistics:'));
    console.log(chalk.gray('  Total Agents:  ') + metrics.totalAgents);
    console.log(chalk.gray('  Total Tasks:   ') + metrics.totalTasks);
    console.log(chalk.gray('  Total Cost:    ') + chalk.yellow(`$${metrics.totalCost.toFixed(4)}`));
    console.log(chalk.gray('  Total Tokens:  ') + (metrics.totalTokens.input + metrics.totalTokens.output).toLocaleString());
    console.log();
  } catch (error) {
    spinner.fail(chalk.red('Failed to list agents'));
    console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'idle':
      return chalk.green(status);
    case 'busy':
      return chalk.yellow(status);
    case 'error':
      return chalk.red(status);
    default:
      return status;
  }
}
