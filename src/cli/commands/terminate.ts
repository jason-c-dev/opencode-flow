import chalk from 'chalk';
import ora from 'ora';
import { initializeOrchestrator, removeAgentFromState, clearState } from '../state.js';

interface TerminateOptions {
  all?: boolean;
}

export async function terminate(name: string | undefined, options: TerminateOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    const orchestrator = await initializeOrchestrator();

    if (options.all) {
      spinner.text = 'Terminating all agents...';
      const agents = orchestrator.list();
      
      if (agents.length === 0) {
        spinner.info(chalk.yellow('No agents to terminate'));
        return;
      }

      await orchestrator.terminateAll();
      await clearState();

      spinner.succeed(chalk.green(`✓ Terminated ${agents.length} agent(s)`));
      console.log();
      console.log(chalk.dim('All agents have been shut down.'));
    } else {
      if (!name) {
        spinner.fail(chalk.red('Agent name required'));
        console.error(chalk.red('\nUsage: opencode-flow terminate <name> or --all'));
        process.exit(1);
      }

      if (!orchestrator.get(name)) {
        spinner.fail(chalk.red(`Agent '${name}' not found`));
        console.error(chalk.yellow('\nUse `opencode-flow list` to see active agents'));
        process.exit(1);
      }

      spinner.text = `Terminating agent '${name}'...`;
      await orchestrator.terminate(name);
      await removeAgentFromState(name);

      spinner.succeed(chalk.green(`✓ Agent '${name}' terminated`));
      console.log();
      console.log(chalk.dim('Agent session has been closed.'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to terminate agent(s)'));
    console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
