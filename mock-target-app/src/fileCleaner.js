const rimraf = require('rimraf');

function deletePath(targetPath) {
  return rimraf.sync(targetPath);
}

module.exports = { deletePath };
