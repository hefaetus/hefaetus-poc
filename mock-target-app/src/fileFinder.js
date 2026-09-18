const glob = require('glob');

function findFiles(pattern) {
  return glob.sync(pattern);
}

module.exports = { findFiles };
