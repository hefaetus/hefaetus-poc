const assert = require('assert');
const { findFiles } = require('../src/fileFinder');

const files = findFiles('*.json');
assert.ok(Array.isArray(files), 'Result must be an array');
console.log('✔ File finder test passed');
