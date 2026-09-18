const rimraf = require('rimraf');

function deletePath(targetPath) {
  return new Promise((resolve, reject) => {
    rimraf(targetPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { deletePath };
