const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const releaseScript = path.join(repoRoot, 'scripts', 'create-offline-release.js');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options
  });

  return {
    ...result,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function runNpm(args, options = {}) {
  return runCommand(process.execPath, [npmCli, ...args], options);
}

function findEvolucionChunk(distDir) {
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    return null;
  }

  return fs.readdirSync(assetsDir).find((entry) => /^EvolucionPrecios-.*\.js$/.test(entry)) ?? null;
}

test('frontend build resolves recharts compat helpers and emits the Evolucion chunk', () => {
  const result = runNpm(['--prefix', 'frontend', 'run', 'build']);

  assert.equal(
    result.status,
    0,
    `Expected frontend build to succeed.\nERROR:\n${result.error?.stack ?? 'none'}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );

  const distDir = path.join(frontendRoot, 'dist');
  const chunkName = findEvolucionChunk(distDir);

  assert.ok(chunkName, 'Expected frontend build to emit an EvolucionPrecios chunk.');
  assert.ok(
    fs.existsSync(path.join(distDir, 'index.html')),
    'Expected frontend build to emit index.html.'
  );
});

test('offline release packages build output, lockfiles, and npm cache for offline installs', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-release-'));

  const scriptResult = runCommand('node', [releaseScript, '--output', outputDir]);

  assert.equal(
    scriptResult.status,
    0,
    `Expected offline release generator to succeed.\nSTDOUT:\n${scriptResult.stdout}\nSTDERR:\n${scriptResult.stderr}`
  );

  const stagedRoot = path.join(outputDir, 'sistema-offline');
  const cacheDir = path.join(stagedRoot, '.npm-cache');

  assert.ok(fs.existsSync(path.join(stagedRoot, 'package.json')), 'Expected backend package.json in offline release.');
  assert.ok(fs.existsSync(path.join(stagedRoot, 'package-lock.json')), 'Expected backend package-lock.json in offline release.');
  assert.ok(fs.existsSync(path.join(stagedRoot, 'frontend', 'package.json')), 'Expected frontend package.json in offline release.');
  assert.ok(fs.existsSync(path.join(stagedRoot, 'frontend', 'package-lock.json')), 'Expected frontend package-lock.json in offline release.');
  assert.ok(fs.existsSync(path.join(stagedRoot, 'frontend', 'dist', 'index.html')), 'Expected built frontend in offline release.');
  assert.ok(findEvolucionChunk(path.join(stagedRoot, 'frontend', 'dist')), 'Expected EvolucionPrecios chunk in offline release.');
  assert.ok(fs.existsSync(cacheDir), 'Expected npm cache directory in offline release.');

  const backendInstall = runNpm(['ci', '--offline', '--cache', cacheDir], {
    cwd: stagedRoot
  });

  assert.equal(
    backendInstall.status,
    0,
    `Expected backend offline npm ci to succeed.\nERROR:\n${backendInstall.error?.stack ?? 'none'}\nSTDOUT:\n${backendInstall.stdout}\nSTDERR:\n${backendInstall.stderr}`
  );

  const frontendInstall = runNpm(['ci', '--offline', '--cache', cacheDir], {
    cwd: path.join(stagedRoot, 'frontend')
  });

  assert.equal(
    frontendInstall.status,
    0,
    `Expected frontend offline npm ci to succeed.\nERROR:\n${frontendInstall.error?.stack ?? 'none'}\nSTDOUT:\n${frontendInstall.stdout}\nSTDERR:\n${frontendInstall.stderr}`
  );
});
