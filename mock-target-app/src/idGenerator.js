const uuid = require('uuid/v4');

function generateId() {
  return uuid();
}

module.exports = { generateId };
