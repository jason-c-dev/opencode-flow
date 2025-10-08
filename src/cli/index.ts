#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { setup } from './commands/setup.js';
import { spawn } from './commands/spawn.js';
import { exec } from './commands/exec.js';
import { list } from './commands/list.js';
import { terminate } from './commands/terminate.js';
import { status } from './commands/status.js';

const program = new Command();

program
  .name('opencode-flow')
  .description('Multi-agent orchestration framework built on OpenCode')
  .version('0.1.0');

program
  .command('setup')
  .description('Interactive setup wizard for first-time configuration')
  .option('--skip-opencode-install', 'Skip OpenCode CLI installation check')
  .option('--skip-server-start', 'Skip starting OpenCode server')
  .option('--port <number>', 'Custom OpenCode server port', parseInt, 4096)
  .option('--config-path <path>', 'Custom config directory')
  .option('--non-interactive', 'Use environment variables, no prompts')
  .action(setup);

program
  .command('spawn')
  .description('Spawn a new agent instance')
  .requiredOption('--name <string>', 'Agent name')
  .option('--agent <type>', 'OpenCode agent type (build, plan, general, custom)', 'general')
  .requiredOption('--model <string>', 'Model identifier (e.g., claude-sonnet-4)')
  .option('--provider <string>', 'Provider (anthropic, openai, google, openrouter)')
  .option('--prompt <string>', 'Custom system prompt')
  .option('--tools <list>', 'Comma-separated tool list')
  .option('--config <path>', 'Path to agent config JSON')
  .action(spawn);

program
  .command('exec')
  .description('Execute a task across one or more agents')
  .requiredOption('--task <string>', 'Task description')
  .requiredOption('--agents <list>', 'Comma-separated agent names')
  .option('--mode <type>', 'Execution mode: parallel, sequential, hierarchical', 'parallel')
  .option('--timeout <ms>', 'Task timeout in milliseconds', parseInt)
  .option('--output <path>', 'Save results to file')
  .action(exec);

program
  .command('list')
  .description('List all active agents')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show detailed agent info')
  .action(list);

program
  .command('terminate [name]')
  .description('Terminate one or all agents')
  .option('--all', 'Terminate all agents')
  .action(terminate);

program
  .command('status')
  .description('Show server and agent status')
  .option('--json', 'Output as JSON')
  .action(status);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
