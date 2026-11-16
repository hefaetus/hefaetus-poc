const { rimraf } = require('rimraf');

function deletePath(targetPath) {
  return rimraf(targetPath);
}

module.exports = { deletePath };
