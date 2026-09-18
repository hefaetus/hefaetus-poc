const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_DIR = path.resolve(__dirname, '../mock-target-app');

console.log('🔄 Resetting mock-target-app to vulnerable baseline (uuid@3.4.0)...');

// 1. Reset package.json
const pkgJson = {
  name: 'mock-target-app',
  version: '1.0.0',
  description: 'Vulnerable demo service using deprecated uuid/v4 API',
  main: 'src/idGenerator.js',
  scripts: {
    test: 'node test/idGenerator.test.js',
  },
  dependencies: {
    uuid: '3.4.0',
  },
};

fs.writeFileSync(
  path.join(TARGET_DIR, 'package.json'),
  JSON.stringify(pkgJson, null, 2) + '\n'
);

// 2. Reset idGenerator.js
const vulnerableCode = `const uuid = require('uuid/v4');

function generateId() {
  return uuid();
}

module.exports = { generateId };
`;

fs.writeFileSync(
  path.join(TARGET_DIR, 'src', 'idGenerator.js'),
  vulnerableCode,
  'utf8'
);

// 3. Reset Git repo to main branch
try {
  execSync('git checkout -f main', { cwd: TARGET_DIR, stdio: 'ignore' });
  execSync('git clean -fd', { cwd: TARGET_DIR, stdio: 'ignore' });
  execSync('git branch -D fix/remediate-uuid-breaking-change', {
    cwd: TARGET_DIR,
    stdio: 'ignore',
  });
} catch {
  // Ignore git errors if branch does not exist or repo is newly created
}

// 4. Re-install uuid@3.4.0
console.log('📦 Re-installing uuid@3.4.0 dependencies...');
try {
  execSync('npm install', { cwd: TARGET_DIR, stdio: 'inherit' });
} catch (e) {
  console.warn('Warning during npm install:', e.message);
}

console.log(
  '\n✅ Reset complete! mock-target-app is ready for live Hefaestus demonstration.\n'
);
