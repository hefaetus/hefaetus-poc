const { rimrafSync } = require('rimraf');

function deletePath(targetPath) {
  return rimrafSync(targetPath);
}

module.exports = { deletePath };

