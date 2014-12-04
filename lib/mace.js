var util = require('./util.js');
var logue = require('./logue.js');
var type = require('./type.js');
var Command = require('./Command.js');
var path = require('path');
var fs = require('fs');

// for old version
exports = module.exports = function () {};
util.merge(exports, util, logue, type, Command);
exports.use = function (file) {
  var __filename = logue._line(2)().split(':')[0];
  var __dirname = path.dirname(__filename);
  if (file[0] === '.') {
    file = path.join(__dirname, file);
  }
  
  file = require.resolve(file);
  require.cache[file] = null;
  delete require.cache[file];
  return require(file);
};
exports.underPath = function (rootdir, file) {
  var path = require('path');
  return path.resolve(rootdir, './' + path.normalize(file));
};