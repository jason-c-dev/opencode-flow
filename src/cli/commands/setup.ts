import chalk from 'chalk';
import ora from 'ora';
import { execSync, spawn as spawnProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { FlowClient } from '../../core/client.js';
import * as readline from 'readline';

interface SetupOptions {
  skipOpencodeInstall?: boolean;
  skipServerStart?: boolean;
  port?: number;
  configPath?: string;
  nonInteractive?: boolean;
}

const DEFAULT_PORT = 4096;
const CONFIG_DIR = path.join(homedir(), '.opencode-flow');
const ENV_FILE = path.join(CONFIG_DIR, '.env');

export async function setup(options: SetupOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('🚀 OpenCode Flow Setup Wizard'));
  console.log();

  try {
    // Step 1: Validate Node.js version
    await validateNodeVersion();

    // Step 2: Check for OpenCode CLI
    if (!options.skipOpencodeInstall) {
      await checkOpenCodeCLI();
    }

    // Step 3: Start/check OpenCode server
    let serverUrl = `http://localhost:${options.port || DEFAULT_PORT}`;
    if (!options.skipServerStart) {
      serverUrl = await ensureOpenCodeServer(options.port || DEFAULT_PORT);
    }

    // Step 4: Configure API keys
    const apiKeys = options.nonInteractive 
      ? await loadFromEnvironment()
      : await configureAPIKeys();

    // Step 5: Save configuration
    await saveConfiguration(serverUrl, apiKeys);

    // Step 6: Health check
    await performHealthCheck(serverUrl);

    // Step 7: Success message
    displaySuccessMessage();

  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function validateNodeVersion(): Promise<void> {
  const spinner = ora('Checking Node.js version...').start();
  
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    
    if (major < 20) {
      spinner.fail(chalk.red('Node.js 20+ required'));
      throw new Error(`Current version: ${version}. Please upgrade to Node.js 20 or higher.`);
    }
    
    spinner.succeed(chalk.green(`✓ Node.js ${version} detected`));
  } catch (error) {
    spinner.fail(chalk.red('Failed to check Node.js version'));
    throw error;
  }
}

async function checkOpenCodeCLI(): Promise<void> {
  const spinner = ora('Checking for OpenCode CLI...').start();

  try {
    execSync('which opencode', { stdio: 'pipe' });
    const version = execSync('opencode --version', { encoding: 'utf-8' }).trim();
    spinner.succeed(chalk.green(`✓ OpenCode CLI found (${version})`));
  } catch (error) {
    spinner.warn(chalk.yellow('OpenCode CLI not found'));
    console.log();
    console.log(chalk.bold('OpenCode CLI is required. Install it with:'));
    console.log(chalk.cyan('  npm install -g opencode'));
    console.log();
    console.log(chalk.dim('Or visit: https://opencode.ai'));
    console.log();
    
    const answer = await prompt('Continue anyway? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      throw new Error('OpenCode CLI is required. Please install it and try again.');
    }
  }
}

async function ensureOpenCodeServer(port: number): Promise<string> {
  const spinner = ora('Checking OpenCode server...').start();
  const serverUrl = `http://localhost:${port}`;

  try {
    const client = new FlowClient({ baseUrl: serverUrl });
    const isHealthy = await client.healthCheck();
    
    if (isHealthy) {
      spinner.succeed(chalk.green(`✓ OpenCode server running on port ${port}`));
      return serverUrl;
    }
  } catch (error) {
    // Server not running
  }

  spinner.info(chalk.yellow('OpenCode server not detected'));
  console.log();
  console.log(chalk.bold('Starting OpenCode server...'));
  console.log(chalk.dim(`This will run: opencode serve --port ${port} --headless`));
  console.log();

  const answer = await prompt('Start OpenCode server now? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    console.log();
    console.log(chalk.yellow('⚠ You will need to start the OpenCode server manually:'));
    console.log(chalk.cyan(`  opencode serve --port ${port} --headless`));
    console.log();
    return serverUrl;
  }

  try {
    // Start server in background
    const serverProcess = spawnProcess('opencode', ['serve', '--port', port.toString(), '--headless'], {
      detached: true,
      stdio: 'ignore'
    });
    serverProcess.unref();

    // Wait for server to be ready
    const startSpinner = ora('Waiting for server to start...').start();
    await sleep(3000); // Give it a few seconds

    const client = new FlowClient({ baseUrl: serverUrl });
    let retries = 10;
    while (retries > 0) {
      try {
        const isHealthy = await client.healthCheck();
        if (isHealthy) {
          startSpinner.succeed(chalk.green(`✓ OpenCode server started on port ${port}`));
          return serverUrl;
        }
      } catch (e) {
        retries--;
        if (retries > 0) {
          await sleep(1000);
        }
      }
    }

    startSpinner.fail(chalk.red('Failed to start server'));
    throw new Error('Server did not respond in time');
  } catch (error) {
    console.log();
    console.log(chalk.yellow('Could not start server automatically. Please start it manually:'));
    console.log(chalk.cyan(`  opencode serve --port ${port} --headless`));
    console.log();
  }

  return serverUrl;
}

async function configureAPIKeys(): Promise<Record<string, string>> {
  console.log();
  console.log(chalk.bold('Configure API Keys'));
  console.log(chalk.dim('Enter at least one API key to use OpenCode Flow'));
  console.log();

  const apiKeys: Record<string, string> = {};

  console.log(chalk.bold('Anthropic (Claude):'));
  const anthropicKey = await prompt('  API Key (sk-ant-...): ', true);
  if (anthropicKey) {
    apiKeys.ANTHROPIC_API_KEY = anthropicKey;
  }

  console.log();
  console.log(chalk.bold('OpenRouter (Multi-model):'));
  const openrouterKey = await prompt('  API Key (sk-or-v1-...): ', true);
  if (openrouterKey) {
    apiKeys.OPENROUTER_API_KEY = openrouterKey;
  }

  console.log();
  console.log(chalk.bold('Google (Gemini):'));
  const googleKey = await prompt('  API Key: ', true);
  if (googleKey) {
    apiKeys.GOOGLE_API_KEY = googleKey;
  }

  if (Object.keys(apiKeys).length === 0) {
    console.log();
    console.log(chalk.yellow('⚠ No API keys provided. You will need to set them manually.'));
    console.log();
  }

  return apiKeys;
}

async function loadFromEnvironment(): Promise<Record<string, string>> {
  const apiKeys: Record<string, string> = {};

  if (process.env.ANTHROPIC_API_KEY) {
    apiKeys.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENROUTER_API_KEY) {
    apiKeys.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  }
  if (process.env.GOOGLE_API_KEY) {
    apiKeys.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  }

  return apiKeys;
}

async function saveConfiguration(serverUrl: string, apiKeys: Record<string, string>): Promise<void> {
  const spinner = ora('Saving configuration...').start();

  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });

    const envContent = [
      '# OpenCode Flow Configuration',
      '# Generated by setup wizard',
      '',
      '# OpenCode Server',
      `OPENCODE_SERVER_URL=${serverUrl}`,
      '',
      '# API Keys',
      ...Object.entries(apiKeys).map(([key, value]) => `${key}=${value}`),
      '',
      '# Flow Configuration',
      'FLOW_MODE=development',
      'FLOW_LOG_LEVEL=info',
      'FLOW_MEMORY_BACKEND=file',
      'FLOW_MEMORY_PATH=./.flow-memory',
      ''
    ].join('\n');

    await fs.writeFile(ENV_FILE, envContent, 'utf-8');

    spinner.succeed(chalk.green(`✓ Configuration saved to ${ENV_FILE}`));
  } catch (error) {
    spinner.fail(chalk.red('Failed to save configuration'));
    throw error;
  }
}

async function performHealthCheck(serverUrl: string): Promise<void> {
  const spinner = ora('Running health check...').start();

  try {
    const client = new FlowClient({ baseUrl: serverUrl });
    const isHealthy = await client.healthCheck();

    if (!isHealthy) {
      throw new Error('Server health check failed');
    }

    // Try to get providers
    try {
      const providers = await client.getProviders();
      spinner.succeed(chalk.green(`✓ Health check passed (${providers.providers.length} providers available)`));
    } catch (e) {
      spinner.succeed(chalk.green('✓ Server is responding'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Health check failed'));
    console.log();
    console.log(chalk.yellow('⚠ The OpenCode server may not be running or configured correctly.'));
    console.log(chalk.dim('  You can still use OpenCode Flow, but you may need to troubleshoot the connection.'));
    console.log();
  }
}

function displaySuccessMessage(): void {
  console.log();
  console.log(chalk.bold.green('✨ Setup Complete!'));
  console.log();
  console.log(chalk.bold('Next Steps:'));
  console.log();
  console.log(chalk.cyan('  1. Spawn your first agent:'));
  console.log(chalk.dim('     opencode-flow spawn --name researcher --agent general --model claude-sonnet-4'));
  console.log();
  console.log(chalk.cyan('  2. Execute a task:'));
  console.log(chalk.dim('     opencode-flow exec --task "Analyze REST API patterns" --agents researcher'));
  console.log();
  console.log(chalk.cyan('  3. List active agents:'));
  console.log(chalk.dim('     opencode-flow list'));
  console.log();
  console.log(chalk.bold('Documentation:'));
  console.log(chalk.dim('  https://github.com/jason-c-dev/opencode-flow'));
  console.log();
}

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (hidden) {
      const stdin = process.stdin;
      (stdin as any).setRawMode(true);
      
      let input = '';
      const onData = (char: Buffer) => {
        const c = char.toString('utf8');
        
        switch (c) {
          case '\n':
          case '\r':
          case '\u0004':
            (stdin as any).setRawMode(false);
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            rl.close();
            resolve(input);
            break;
          case '\u0003':
            process.exit();
            break;
          case '\u007f': // backspace
            input = input.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(question + '*'.repeat(input.length));
            break;
          default:
            input += c;
            process.stdout.write('*');
        }
      };

      process.stdout.write(question);
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
