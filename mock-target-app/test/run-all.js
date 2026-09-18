const { spawnSync } = require('child_process');
const path = require('path');

console.log('🧪 Running mock-target-app test suite...');

const tests = [
  'test/idGenerator.test.js',
  'test/fileFinder.test.js',
  'test/fileCleaner.test.js',
];

for (const t of tests) {
  const fullPath = path.join(__dirname, '..', t);
  const result = spawnSync(process.execPath, [fullPath], {
    encoding: 'utf8',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\n✔ All tests passed');
