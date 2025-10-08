import chalk from 'chalk';
import ora from 'ora';
import { loadState, initializeOrchestrator } from '../state.js';

interface StatusOptions {
  json?: boolean;
}

export async function status(options: StatusOptions): Promise<void> {
  const spinner = ora('Checking status...').start();

  try {
    const state = await loadState();
    const orchestrator = await initializeOrchestrator();

    const serverHealthy = await orchestrator['client'].healthCheck();

    spinner.stop();

    if (options.json) {
      const data = {
        server: {
          url: state.serverUrl,
          healthy: serverHealthy
        },
        agents: {
          active: orchestrator.list().length,
          total: state.agents.length
        },
        metrics: orchestrator.getMetrics()
      };
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('OpenCode Flow Status'));
    console.log();

    console.log(chalk.bold('Server:'));
    console.log(chalk.gray('  URL:        ') + state.serverUrl);
    console.log(chalk.gray('  Status:     ') + (serverHealthy ? chalk.green('✓ Connected') : chalk.red('✗ Disconnected')));
    console.log();

    const agents = orchestrator.getAll();
    console.log(chalk.bold('Agents:'));
    console.log(chalk.gray('  Active:     ') + chalk.cyan(agents.length));
    
    if (agents.length > 0) {
      const idleCount = agents.filter((a: any) => a.status === 'idle').length;
      const busyCount = agents.filter((a: any) => a.status === 'busy').length;
      const errorCount = agents.filter((a: any) => a.status === 'error').length;
      
      console.log(chalk.gray('  Idle:       ') + chalk.green(idleCount));
      console.log(chalk.gray('  Busy:       ') + chalk.yellow(busyCount));
      if (errorCount > 0) {
        console.log(chalk.gray('  Error:      ') + chalk.red(errorCount));
      }
    }
    console.log();

    const metrics = orchestrator.getMetrics();
    if (metrics.totalTasks > 0) {
      console.log(chalk.bold('Metrics:'));
      console.log(chalk.gray('  Tasks:      ') + metrics.totalTasks);
      console.log(chalk.gray('  Total Cost: ') + chalk.yellow(`$${metrics.totalCost.toFixed(4)}`));
      console.log(chalk.gray('  Tokens:     ') + (metrics.totalTokens.input + metrics.totalTokens.output).toLocaleString());
      console.log();
    }

    if (!serverHealthy) {
      console.log(chalk.yellow('⚠ OpenCode server is not responding'));
      console.log(chalk.dim('  Make sure the OpenCode server is running on ' + state.serverUrl));
      console.log();
    } else if (agents.length === 0) {
      console.log(chalk.dim('No agents spawned yet.'));
      console.log(chalk.dim('Use `opencode-flow spawn` to create an agent.'));
      console.log();
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to get status'));
    console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
