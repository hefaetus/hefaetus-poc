const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { deletePath } = require('../src/fileCleaner');

async function test() {
  const tempDir = path.join(__dirname, 'temp_cleanup_target');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  await deletePath(tempDir);
  assert.strictEqual(fs.existsSync(tempDir), false, 'Directory should have been deleted');
  console.log('✔ File cleaner test passed');
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
