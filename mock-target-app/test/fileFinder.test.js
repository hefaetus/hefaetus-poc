const assert = require('assert');
const { findFiles } = require('../src/fileFinder');

async function test() {
  const files = await findFiles('*.json');
  assert.ok(Array.isArray(files), 'Result must be an array');
  console.log('✔ File finder test passed');
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
