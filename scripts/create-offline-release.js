const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const frontendDist = path.join(frontendRoot, 'dist');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const defaultOutputRoot = path.join(repoRoot, 'artifacts', 'offline-release');
const defaultStageName = 'sistema-offline';
const forbiddenRuntimeReferences = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
];

function parseArgs(argv) {
  const options = {
    output: defaultOutputRoot
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--output') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!options.output) {
    throw new Error('Missing value for --output');
  }

  return options;
}

function showHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/create-offline-release.js [--output <directory>]',
      '',
      'Creates a staged offline release with the built frontend, lockfiles,',
      'and a dedicated npm cache that can satisfy npm ci --offline for both',
      'the backend and frontend.'
    ].join('\n')
  );
}

function runNpm(args, cwd) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `npm ${args.join(' ')} failed in ${cwd}.`,
        result.stdout?.trim(),
        result.stderr?.trim()
      ].filter(Boolean).join('\n')
    );
  }
}

function ensureBuiltFrontend() {
  if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
    throw new Error('Missing frontend/dist. Run npm --prefix frontend run build before creating the offline release.');
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function copyReleaseTree(sourceRoot, destinationRoot, outputRoot) {
  const excludedTopLevel = new Set([
    '.git',
    'node_modules',
    'artifacts',
    'backups',
    'logs'
  ]);

  fs.cpSync(sourceRoot, destinationRoot, {
    recursive: true,
    force: true,
    filter(source) {
      const normalizedSource = path.resolve(source);

      if (normalizedSource === sourceRoot) {
        return true;
      }

      if (isInside(outputRoot, normalizedSource)) {
        return false;
      }

      if (normalizedSource === path.join(sourceRoot, 'frontend', 'node_modules')) {
        return false;
      }

      const relative = path.relative(sourceRoot, normalizedSource);
      if (!relative) {
        return true;
      }

      const [topLevel] = relative.split(path.sep);
      return !excludedTopLevel.has(topLevel);
    }
  });
}

function scanForRuntimeCdns(distRoot) {
  const queue = [distRoot];
  const offenders = [];

  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!/\.(css|html|js)$/i.test(entry.name)) {
        continue;
      }

      const content = fs.readFileSync(entryPath, 'utf8');
      const match = forbiddenRuntimeReferences.find((reference) => content.includes(reference));
      if (match) {
        offenders.push(`${path.relative(distRoot, entryPath)} -> ${match}`);
      }
    }
  }

  if (offenders.length > 0) {
    throw new Error(`Found runtime CDN or remote font references in frontend/dist:\n${offenders.join('\n')}`);
  }
}

function primeOfflineCache(stageRoot, cacheDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-offline-cache-'));

  try {
    const backendTemp = path.join(tempRoot, 'backend');
    const frontendTemp = path.join(tempRoot, 'frontend');

    fs.mkdirSync(backendTemp, { recursive: true });
    fs.mkdirSync(frontendTemp, { recursive: true });

    fs.copyFileSync(path.join(stageRoot, 'package.json'), path.join(backendTemp, 'package.json'));
    fs.copyFileSync(path.join(stageRoot, 'package-lock.json'), path.join(backendTemp, 'package-lock.json'));
    fs.copyFileSync(path.join(stageRoot, 'frontend', 'package.json'), path.join(frontendTemp, 'package.json'));
    fs.copyFileSync(path.join(stageRoot, 'frontend', 'package-lock.json'), path.join(frontendTemp, 'package-lock.json'));

    runNpm(['ci', '--cache', cacheDir, '--ignore-scripts', '--no-audit', '--no-fund'], backendTemp);
    runNpm(['ci', '--cache', cacheDir, '--ignore-scripts', '--no-audit', '--no-fund'], frontendTemp);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeInstructions(stageRoot) {
  const instructions = [
    'Offline install commands:',
    'npm ci --offline --cache .npm-cache',
    'npm --prefix frontend ci --offline --cache ../.npm-cache',
    'npm --prefix frontend run build'
  ].join('\n');

  fs.writeFileSync(path.join(stageRoot, 'OFFLINE-INSTALL.txt'), instructions);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    return;
  }

  ensureBuiltFrontend();
  scanForRuntimeCdns(frontendDist);

  const outputRoot = path.resolve(options.output);
  const stageRoot = path.join(outputRoot, defaultStageName);
  const cacheDir = path.join(stageRoot, '.npm-cache');

  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  copyReleaseTree(repoRoot, stageRoot, outputRoot);
  fs.mkdirSync(cacheDir, { recursive: true });

  primeOfflineCache(stageRoot, cacheDir);
  writeInstructions(stageRoot);

  process.stdout.write(`${stageRoot}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
