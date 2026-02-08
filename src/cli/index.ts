#!/usr/bin/env node

import { Command } from 'commander'
import { runCommand } from './commands/run.js'
import { planCommand } from './commands/plan.js'
import { doctorCommand } from './commands/doctor.js'

const program = new Command()

program
  .name('agent-helper')
  .description('Multi-agent LLM coding assistant')
  .version('0.1.0')

program
  .command('run')
  .description('Run a development task')
  .argument('<request>', 'The development request to execute')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-y, --yes', 'Apply changes automatically without prompting', false)
  .option('-v, --verbose', 'Enable verbose logging', false)
  .option('--non-interactive', 'Disable interactive prompts (for CI/CD)', false)
  .action(runCommand)

program
  .command('plan')
  .description('Plan a task without executing (dry run)')
  .argument('<request>', 'The development request to plan')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(planCommand)

program
  .command('doctor')
  .description('Check LLM connectivity and configuration')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .action(doctorCommand)

program.parse()
