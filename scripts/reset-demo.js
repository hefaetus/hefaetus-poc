const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_DIR = path.resolve(__dirname, '../mock-target-app');

console.log('🔄 Resetting mock-target-app to vulnerable baseline (uuid@3.4.0, glob@7.2.3, rimraf@3.0.2)...');

// 1. Reset package.json
const pkgJson = {
  name: 'mock-target-app',
  version: '1.0.0',
  description: 'Vulnerable demo service using deprecated uuid, glob, and rimraf APIs',
  main: 'src/idGenerator.js',
  scripts: {
    test: 'node test/run-all.js',
  },
  dependencies: {
    glob: '7.2.3',
    rimraf: '3.0.2',
    uuid: '3.4.0',
  },
};

fs.writeFileSync(
  path.join(TARGET_DIR, 'package.json'),
  JSON.stringify(pkgJson, null, 2) + '\n'
);

// 2. Reset idGenerator.js
const idGenCode = `const uuid = require('uuid/v4');

function generateId() {
  return uuid();
}

module.exports = { generateId };
`;

fs.writeFileSync(
  path.join(TARGET_DIR, 'src', 'idGenerator.js'),
  idGenCode,
  'utf8'
);

// 3. Reset fileFinder.js
const fileFinderCode = `const glob = require('glob');

function findFiles(pattern) {
  return new Promise((resolve, reject) => {
    glob(pattern, (err, files) => {
      if (err) reject(err);
      else resolve(files);
    });
  });
}

module.exports = { findFiles };
`;

fs.writeFileSync(
  path.join(TARGET_DIR, 'src', 'fileFinder.js'),
  fileFinderCode,
  'utf8'
);

// 4. Reset fileCleaner.js
const fileCleanerCode = `const rimraf = require('rimraf');

function deletePath(targetPath) {
  return new Promise((resolve, reject) => {
    rimraf(targetPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { deletePath };
`;

fs.writeFileSync(
  path.join(TARGET_DIR, 'src', 'fileCleaner.js'),
  fileCleanerCode,
  'utf8'
);

// 5. Safely delete remediation branches if they exist (without touching working tree files)
try {
  execSync('git branch -D fix/remediate-uuid-breaking-change', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore',
  });
} catch {}

try {
  execSync('git branch -D fix/hefaetus-autonomous-dependency-remediation', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore',
  });
} catch {}

// 6. Re-install vulnerable baseline dependencies in mock-target-app
console.log('📦 Installing vulnerable dependencies in mock-target-app...');
try {
  execSync('npm install', { cwd: TARGET_DIR, stdio: 'inherit' });
} catch (e) {
  console.warn('Warning during npm install:', e.message);
}

console.log(
  '\n✅ Reset complete! mock-target-app is ready for live Hefaetus demonstration.\n'
);
