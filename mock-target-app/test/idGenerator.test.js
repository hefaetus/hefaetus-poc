const assert = require('assert');
const { generateId } = require('../src/idGenerator');

const id = generateId();
assert.strictEqual(typeof id, 'string');
assert.ok(id.length > 0, 'Generated ID should not be empty');
console.log('✔ All tests passed');
