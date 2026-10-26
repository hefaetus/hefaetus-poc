const { globSync } = require('glob');

function findFiles(pattern) {
  return globSync(pattern);
}

module.exports = { findFiles };

