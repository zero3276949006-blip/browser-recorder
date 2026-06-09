#!/usr/bin/env node
/**
 * Browser Recorder CLI — `br`
 *
 * Commands:
 *   br generate <recording.json>  Convert recording to Playwright script
 *   br play <recording.json>      Play back a recording
 *   br list                       List recordings in current directory
 *   br init                       Initialize Playwright in current project
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { generateScript } from './generator';
import { Recording, GeneratorOptions } from './types';

const program = new Command();

program
  .name('br')
  .description('Browser Recorder — record and generate Playwright test scripts')
  .version('0.1.0');

// ── generate ──────────────────────────────────────────────

program
  .command('generate <file>')
  .alias('gen')
  .description('Convert a browser recording to a Playwright test script')
  .option('-o, --output <dir>', 'Output directory', './tests')
  .option('-f, --format <format>', 'Output format: test | script', 'test')
  .option('--no-parameterize', 'Disable variable extraction')
  .option('--no-smart-wait', 'Disable smart wait insertion')
  .option('--screenshot-on-failure', 'Add screenshot-on-failure config')
  .action((file: string, options: any) => {
    const recordingPath = path.resolve(file);

    if (!fs.existsSync(recordingPath)) {
      console.error(chalk.red(`✗ Recording file not found: ${file}`));
      process.exit(1);
    }

    let recording: Recording;
    try {
      recording = JSON.parse(fs.readFileSync(recordingPath, 'utf-8'));
    } catch (e) {
      console.error(chalk.red('✗ Invalid JSON recording file'));
      process.exit(1);
    }

    if (!recording.steps || !Array.isArray(recording.steps)) {
      console.error(chalk.red('✗ Invalid recording format: missing "steps" array'));
      process.exit(1);
    }

    const genOpts: GeneratorOptions = {
      format: options.format === 'script' ? 'script' : 'test',
      parameterize: options.parameterize !== false,
      smartWait: options.smartWait !== false,
      screenshotOnFailure: options.screenshotOnFailure || false,
    };

    console.log(chalk.blue(`\n📼  Recording: ${chalk.bold(recording.title)}`));
    console.log(chalk.gray(`    URL: ${recording.startUrl}`));
    console.log(chalk.gray(`    Steps: ${recording.steps.length}`));
    console.log(chalk.gray(`    Recorded: ${recording.recordedAt}`));

    const result = generateScript(recording, genOpts);

    // Ensure output directory exists
    const outputDir = path.resolve(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, result.filename);
    fs.writeFileSync(outputPath, result.code);

    console.log(chalk.green(`\n✅  Generated: ${chalk.bold(outputPath)}`));
    console.log(chalk.gray(`    Format: ${genOpts.format === 'test' ? 'Playwright Test' : 'Standalone Script'}`));
    console.log(chalk.gray(`    Parameterized: ${genOpts.parameterize ? 'Yes' : 'No'}`));

    if (result.variables.size > 0) {
      console.log(chalk.cyan(`\n📦  Extracted variables:`));
      for (const [name, value] of result.variables) {
        console.log(chalk.gray(`    const ${name} = ${JSON.stringify(value)};`));
      }
    }

    // Print preview
    const previewLines = result.code.split('\n');
    const previewCount = Math.min(process.stdout.rows ? Math.max(12, process.stdout.rows - 15) : 16, previewLines.length);
    console.log(chalk.blue(`\n── Preview (first ${previewCount} lines) ──`));
    console.log(previewLines.slice(0, previewCount).join('\n'));
    if (previewLines.length > previewCount) {
      console.log(chalk.gray(`... ${previewLines.length - previewCount} more lines`));
    }

    console.log(chalk.green(`\n🚀  Run it:`));
    console.log(chalk.white(`    npx playwright test ${path.relative(process.cwd(), outputPath)}`));
    console.log();
  });

// ── list ──────────────────────────────────────────────────

program
  .command('list')
  .alias('ls')
  .description('List recordings in the current directory')
  .option('-d, --dir <dir>', 'Directory to scan', './')
  .action((options: any) => {
    const dir = path.resolve(options.dir);
    if (!fs.existsSync(dir)) {
      console.error(chalk.red(`✗ Directory not found: ${dir}`));
      process.exit(1);
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const recordings: { file: string; title: string; steps: number; date: string }[] = [];

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        if (data.steps && Array.isArray(data.steps)) {
          recordings.push({
            file,
            title: data.title || 'Untitled',
            steps: data.steps.length,
            date: data.recordedAt || 'Unknown',
          });
        }
      } catch {
        // Skip invalid JSON files
      }
    }

    if (recordings.length === 0) {
      console.log(chalk.gray('No recordings found.'));
      console.log(chalk.gray('Use the browser extension to create recordings (Ctrl+Shift+R).'));
      return;
    }

    console.log(chalk.blue(`\n📼  Found ${recordings.length} recording(s):\n`));
    for (const r of recordings) {
      console.log(
        `  ${chalk.bold(r.file)}` +
          chalk.gray(`  —  ${r.title}  (${r.steps} steps, ${r.date})`)
      );
    }
    console.log();
  });

// ── init ──────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize Playwright in current project')
  .action(() => {
    console.log(chalk.blue('\n📦  Setting up Playwright...\n'));
    console.log(chalk.white('  npm init -y'));
    console.log(chalk.white('  npm install -D @playwright/test'));
    console.log(chalk.white('  npx playwright install'));
    console.log();
    console.log(chalk.green('After setup, create playwright.config.ts:'));
    console.log(chalk.gray(`

import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3000',
  },
});
    `));
    console.log();
  });

// ── info ──────────────────────────────────────────────────

program
  .command('info <file>')
  .description('Show recording details')
  .action((file: string) => {
    const recordingPath = path.resolve(file);
    if (!fs.existsSync(recordingPath)) {
      console.error(chalk.red(`✗ File not found: ${file}`));
      process.exit(1);
    }

    const recording = JSON.parse(fs.readFileSync(recordingPath, 'utf-8')) as Recording;

    console.log(chalk.blue(`\n📼  ${chalk.bold(recording.title)}`));
    console.log(chalk.gray(`    URL:      ${recording.startUrl}`));
    console.log(chalk.gray(`    Steps:    ${recording.steps.length}`));
    console.log(chalk.gray(`    Recorded: ${recording.recordedAt}`));

    // Step type breakdown
    const typeCounts: Record<string, number> = {};
    for (const step of recording.steps) {
      typeCounts[step.type] = (typeCounts[step.type] || 0) + 1;
    }

    console.log(chalk.blue('\n  Step breakdown:'));
    for (const [type, count] of Object.entries(typeCounts).sort()) {
      const icon = stepIcon(type);
      console.log(chalk.gray(`    ${icon} ${type}: ${count}`));
    }
    console.log();
  });

function stepIcon(type: string): string {
  const icons: Record<string, string> = {
    navigation: '🌐',
    click: '👆',
    dblclick: '👆👆',
    input: '⌨️',
    select: '📋',
    check: '☑️',
    upload: '📎',
    keydown: '⌨️',
    hover: '🖱️',
    assert: '✅',
    screenshot: '📸',
    wait: '⏳',
  };
  return icons[type] || '•';
}

program.parse();
