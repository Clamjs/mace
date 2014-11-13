var util = require('./util.js');
var logue = require('./logue.js');
var type = require('./type.js');
var Command = require('./Command.js');
var mkdirp = require('./mkdirp.js');
exports = module.exports = function (targetModule) {
  var Module = targetModule.constructor;
  var cache = Module._cache;
  var getModulePath = Module._resolveFilename;
  function clearCache (file) {
    cache[file] = null;
    delete cache[file];
    cache[file = getModulePath(file, targetModule)] = null;
    delete cache[file];
    return file;
  }
  var use = exports.use = targetModule.use = function (file) {
    file = clearCache(file);
    try {
      return targetModule.require(file);
    } catch(e) {
      logue.error(e);
      return {};
    }
  };
  use.engine = function (name, fn) {
    if (!name) {
      return require.extensions;
    }
    if (!fn) {
      if (typeof name === 'string') {
        return require.extensions['.' + name];
      }
      if (typeof name === 'function' && name.name !== undefined) {
        fn = name;
        name = fn.name;
      } else {
        throw new TypeError('name or function is invalid;');
      }
    }
    require.extensions['.'+ name] = fn;
  };
  use.cache = require.cache;
  use.resolve = function (file) {
    return getModulePath(file, targetModule);
  };
  use.engine(function ason (module, filename) {
    try {
      var content = require('fs').readFileSync(getModulePath(filename), 'utf8');
      content = util.stripBOM(content).toString().replace(/\/\/.*(\n\r*)/g,'').replace(/\/\*(.*)\*\//g,'').replace(/^\#\!.*\n\r*/,'');
      var data = module.exports = new Function('return ' + content +';')();
    } catch (err) {
      err.message = filename + ': ' + err.message;
      throw err;
    }
  });
  return exports;
};

util.merge(exports, util, logue, type, Command, mkdirp);

exports.underPath = function (rootdir, file) {
  var path = require('path');
  return path.resolve(rootdir, './' + path.normalize(file));
};