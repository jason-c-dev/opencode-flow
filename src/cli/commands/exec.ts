import chalk from 'chalk';
import ora from 'ora';
import { initializeOrchestrator } from '../state.js';
import { ExecutionMode } from '../../core/types.js';
import * as fs from 'fs/promises';

interface ExecOptions {
  task: string;
  agents: string;
  mode: string;
  timeout?: number;
  output?: string;
}

export async function exec(options: ExecOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    const agentNames = options.agents.split(',').map(a => a.trim());
    const mode = options.mode as ExecutionMode;

    if (!['parallel', 'sequential', 'hierarchical'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be parallel, sequential, or hierarchical`);
    }

    spinner.text = 'Connecting to OpenCode server...';
    const orchestrator = await initializeOrchestrator();

    for (const name of agentNames) {
      if (!orchestrator.get(name)) {
        throw new Error(`Agent '${name}' not found. Use 'opencode-flow spawn' to create it.`);
      }
    }

    spinner.text = `Executing task in ${mode} mode...`;
    const startTime = Date.now();

    const results = await orchestrator.execute({
      task: options.task,
      agents: agentNames,
      mode,
      timeout: options.timeout
    });

    const duration = Date.now() - startTime;

    spinner.succeed(chalk.green('✓ Task completed'));

    console.log();
    console.log(chalk.bold('Execution Results:'));
    console.log(chalk.gray('  Mode:      ') + mode);
    console.log(chalk.gray('  Agents:    ') + agentNames.join(', '));
    console.log(chalk.gray('  Duration:  ') + `${(duration / 1000).toFixed(2)}s`);
    console.log();

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);

    console.log(chalk.bold('Summary:'));
    console.log(chalk.gray('  Total Cost:   ') + chalk.yellow(`$${totalCost.toFixed(4)}`));
    console.log(chalk.gray('  Total Tokens: ') + totalTokens.toLocaleString());
    console.log();

    for (const result of results) {
      console.log(chalk.bold(`Agent: ${result.agent}`));
      console.log(chalk.gray('  Status:   ') + (result.status === 'fulfilled' ? chalk.green('✓ Success') : chalk.red('✗ Failed')));
      console.log(chalk.gray('  Duration: ') + `${(result.duration / 1000).toFixed(2)}s`);
      console.log(chalk.gray('  Cost:     ') + `$${result.cost.toFixed(4)}`);
      console.log(chalk.gray('  Tokens:   ') + `${result.tokensUsed.input + result.tokensUsed.output} (in: ${result.tokensUsed.input}, out: ${result.tokensUsed.output})`);

      if (result.status === 'fulfilled' && result.output) {
        console.log();
        console.log(chalk.bold('  Output:'));
        const textParts = result.output.parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text);
        
        for (const text of textParts) {
          console.log(chalk.dim('  ' + text.split('\n').join('\n  ')));
        }
      } else if (result.status === 'rejected' && result.error) {
        console.log();
        console.log(chalk.red('  Error: ') + result.error.message);
      }
      
      console.log();
    }

    if (options.output) {
      await fs.writeFile(
        options.output,
        JSON.stringify({ task: options.task, mode, results, duration, totalCost, totalTokens }, null, 2),
        'utf-8'
      );
      console.log(chalk.dim(`Results saved to: ${options.output}`));
    }
  } catch (error) {
    spinner.fail(chalk.red('Task execution failed'));
    console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
