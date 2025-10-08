import chalk from 'chalk';
import ora from 'ora';
import { AgentConfig } from '../../core/types.js';
import { initializeOrchestrator, addAgentToState } from '../state.js';
import * as fs from 'fs/promises';

interface SpawnOptions {
  name: string;
  agent: string;
  model: string;
  provider?: string;
  prompt?: string;
  tools?: string;
  config?: string;
}

export async function spawn(options: SpawnOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    let agentConfig: AgentConfig;

    if (options.config) {
      spinner.text = 'Loading config file...';
      const configData = await fs.readFile(options.config, 'utf-8');
      agentConfig = JSON.parse(configData);
    } else {
      agentConfig = {
        name: options.name,
        agent: options.agent,
        model: options.model,
        provider: options.provider,
        systemPrompt: options.prompt,
        tools: options.tools?.split(',').map(t => t.trim())
      };
    }

    spinner.text = 'Connecting to OpenCode server...';
    const orchestrator = await initializeOrchestrator();

    spinner.text = `Spawning agent '${agentConfig.name}'...`;
    const agent = await orchestrator.spawn(agentConfig);

    await addAgentToState({
      name: agent.name,
      agent: agent.config.agent,
      model: agent.config.model,
      provider: agent.config.provider,
      sessionId: agent.sessionId
    });

    spinner.succeed(chalk.green(`✓ Agent '${agent.name}' spawned successfully`));

    console.log();
    console.log(chalk.bold('Agent Details:'));
    console.log(chalk.gray('  Name:      ') + agent.name);
    console.log(chalk.gray('  Type:      ') + agent.config.agent);
    console.log(chalk.gray('  Model:     ') + agent.config.model);
    console.log(chalk.gray('  Provider:  ') + (agent.config.provider || 'default'));
    console.log(chalk.gray('  Session:   ') + agent.sessionId);
    console.log(chalk.gray('  Status:    ') + chalk.cyan(agent.status));
    console.log();
    console.log(chalk.dim('Use `opencode-flow list` to see all agents'));
    console.log(chalk.dim('Use `opencode-flow exec` to run tasks'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to spawn agent'));
    console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
