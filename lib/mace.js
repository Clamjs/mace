var util = require('./util.js');
var logue = require('./logue.js');
var type = require('./type.js');
var Command = require('./Command.js');
var mkdirp = require('./mkdirp.js');
util.merge(exports, util, logue, type, Command, mkdirp);

exports.use = function (file) {
  require.cache[file] = null;
  delete require.cache[file];
  require.cache[file = require.resolve(file)] = null;
  delete require.cache[file];
  try {
    return require(file);
  } catch(e) {
    logue.error(e);
    return {};
  }  
};