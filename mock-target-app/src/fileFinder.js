const { glob } = require('glob');

function findFiles(pattern) {
  return glob(pattern);
}

module.exports = { findFiles };
