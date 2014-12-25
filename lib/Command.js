var EventEmitter = require('events').EventEmitter;
var util = require('./util.js');
var logue = require('./logue.js');
var debug = logue.debug('mace:Command');

var _reCommand = /^[a-zA-Z\_\$][\_\$a-zA-Z0-9]+$/;
var _reAllSpaces = /\s+/g;
var _reOption = /^\s*-([a-z])\s*\,\s*--(no-)*([a-z]+)\s*([a-z\<\>\[\]\:]+)*$/i;
var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
//必选: <必选> 可选: [可选]
var _reParams = /^\<([a-z]+)\>|\[([a-z]+)\]$/i;
function Option (flags, desc, defaultValue, validHandle) {
  flags = flags.replace(_reAllSpaces,' ').trim().match(_reOption);
  if (!flags) {
    logue.error([
        'Option\'s flags example:'
      , '\t-p, --port <port>'
      , '\t-L, --no-log'
      , '\t-P, --path <path>'
      , ''
    ].join('\n\r'));
    return process.exit(0);
  }
  this.flags = flags.shift();
  this.short = flags.shift();
  this.prefix = flags.shift() || '';
  this.name = this.long = util.camelCase(this.prefix + flags.shift());
  this.required = false;
  var argv = flags.shift();
  // 是否为非
  this.boolean = !!this.prefix;
  if (argv && (argv = argv.match(_reParams))) {
    this.name = argv[1] || argv[2];
    this.required = !!argv[1];
  }
  this.description = desc || '';
  var isRequired = this.required;
  var isBoolean = this.boolean;
  if (!validHandle && typeof defaultValue === 'function') {
    validHandle = defaultValue;
    defaultValue = null;
  }
  validHandle = validHandle || function (val) {
    if (isRequired) {
      return val !== "null" && val !== "undefined" && val != null;
    }
    return true;
  };
  var self = this;
  Object.defineProperties(this, {
    'value':  {
      get: function () {
        // ??????
        // if (!argv) {
        //   return null;
        // }
        // debug('get %s <= %s', self.name, defaultValue);
        return defaultValue;
      },
      set: function (value) {
        // debug('set %s => %s', self.name, value);
        if (!argv) {
          // readonly
          return true;
        }
        if (validHandle(value)) {
          if (isBoolean) {
            // only false
            if (false === value || 'false' === value) {
              defaultValue = false;
            } else {
              defaultValue = true;
            }
          } else if (undefined !== value) {
            defaultValue = value;
          }
          
          return true;
        }
        return false;
      },
      enumerable: false,
      configurable: false
    }
  });
};

function Command (flag, description, version, handle) {
  flag = flag.trim().replace(_reAllSpaces,' ');
  // flag example
  // on
  if (!flag.match(_reCommand)) {
    logue.error([
        'Command example:'
      , '\thelp'
      , ''
    ].join('\r\n'));
    return process.exit(0);
  }
  this.name = flag;
  this.description = description;
  this._options = {};
  this._alias = {};
  this._commands = {};
  if (!handle && typeof version === 'function') {
    handle = version;
    version = null;
  }
  this.version = version || '0.0.0';
  this.handle = handle;
  // add help as default
  this.option('-h, --help', 'Show ' + flag + '\'s help info.', this.help.bind(this));
}
util.inherits(Command, {
  command: function (flag, description, handle) {
    var cmd = new Command(flag, description, handle);
    cmd.parent = this;
    this._commands[cmd.name] = cmd;
    return cmd;
  },
  action: function (handle) {
    this.handle = handle;
    return this.parent || this;
  },
  option: function (flag, description, defaultValue, validHandle) {
    var opt = new Option(flag, description, defaultValue, validHandle);
    this._options[opt.long] = opt;
    this._alias[opt.short] = opt.long;
    return this;
  },
  parse: function (info) {
    var command = this;
    var handle;
    var options = util.merge({}, command._options);
    // no command 
    if (info.cmds.length) {
      util.every(info.cmds, function (cmd) {
        var cmds = command._commands;
        if (cmds[cmd]) {
          command = cmds[cmd];
          options = util.merge(options, command._options);
        } else {
          self.help('Failed use command `' + cmd + '`,help info:');
          return false;
        }
      });
    }
    if (typeof command.handle === 'function') {
      handle = command.handle;
    } else {
      return command.help('Failed use command ' + command.name + ',help info: ');
    }
    var $inject = handle.$inject;
    var cmd = command;
    var params = {};
    util.each(options, function (opt, name) {
      var opts = info.options;
      opt.value = opts[name] || opts[opt.short] || opts[opt.long];
      params[name] = opt.value;
    });

    if (!$inject) {
      handle.$inject = [];
      var fnText = handle.toString().replace(STRIP_COMMENTS, '');
      fnText.match(FN_ARGS)[1].split(FN_ARG_SPLIT).forEach(function(arg) {
        arg.replace(FN_ARG, function(all, underscore, name) {
          handle.$inject.push(name);
        });
      });
    }
    var args = [];
    if (handle.$inject.length) {
      util.each(handle.$inject, function (name) {
        if (name === '$params') {
          return args.push(params);
        }
        if (name === '$argv') {
          return args.push(info);
        }
        return args.push(params[name]);
      });
      handle.apply(command, args);
    } else {
      handle.call(command, params, info);
    }
    return command
  },
  help: function (header) {
    var output = process.stdout;
    var _helpmsg = this._helpmsg;
    header = header || [
      'Usage: Command ' + this.name + '\'s help info',
      'Version: ' + this.version,
      ''
    ].join('\n\r');
    if (_helpmsg) {
      output.write(header + '\n\r');
      output.write(this._helpmsg);
      return this;
    }
    var command = this;
    _helpmsg = [];
    if (Object.keys(this._commands).length) {
      _helpmsg.push('Commands: ');
      var _maxLen = 0;
      util.each(this._commands, function (cmd) {
        var name = cmd.name;
        if (name.length > _maxLen) {
          _maxLen = name.length;
        }
      });
      util.each(this._commands, function (cmd) {
        _helpmsg.push('    ' + cmd.name + 
          new Array(_maxLen - cmd.name.length + 1).join(' ') + 
          ' ' + cmd.description
        );
      });
      _helpmsg.push(' ');
    }
    while(command) {
      if (command === this) {
        var optionsHelpMsg = [
          '  Options for ' + command.name
        ];
      } else {
        var optionsHelpMsg = [
          '  Options inherits from ' + command.name
        ];
      }
      var _maxLen = 0;
      util.each(command._options, function (opt, name) {
        var flags = opt.flags;
        if (flags.length > _maxLen) {_maxLen = flags.length}
      });

      util.each(command._options, function (opt, name) {
        optionsHelpMsg.push('    ' + opt.flags + 
          new Array(_maxLen - opt.flags.length + 1).join(' ') +
          '  ' + 
          opt.description
        );
      });
      optionsHelpMsg.push('');
      _helpmsg.unshift(optionsHelpMsg.join('\n\r'));
      command = command.parent;
    }
    this._helpmsg = _helpmsg.join('\n\r');
    output.write(header + '\n\r')
    output.write(this._helpmsg);
    process.exit(0);
    return this;
  }
});
Option.isKey = function (key) {
  return key[0] === '-';
}
Option.getKey = function (key) {
  key = key.substr(1);
  // --all 
  if (key[0] === '-') {
    return key.substr(1);
  }
  // -am => am => ['a','m'];
  return key.split('');
}
Command.parse = function (argv) {
  var cmds = [];
  var options = {};
  var ret = {
    bin: argv.shift(),
    file: argv.shift(),
    cmds: cmds,
    options: options
  };
  var arg;
  var key;
  var val;
  var optCount = 0;
  function resolveValue () {
    var spec = {
      '': undefined,
      'null': null,
      'true': true,
      'false': false,
      'undefined': undefined,
      'nil': null
    };
    if (spec.hasOwnProperty(val)) {
      return spec[val];
    }
    // number
    if (parseFloat(val) === +val) {
      return +val;
    }
    return val;
  }
  function addOption (arg) {
    val = resolveValue();
    if (typeof key === 'string') {
      options[key] = val;
    } else {
      util.each(key, function (k) {
        options[k] = val;
      });
    }
    val = null;
    key = arg && Option.getKey(arg);
  }
  while(argv.length) {
    arg = argv.shift().trim();
    // 
    if (!key) {
      key = arg;
      if (Option.isKey(key)) {
        key = Option.getKey(key);
        continue;
      }
      cmds.push(key);
      key = null;
      val = null;
      continue;
    }
    // an new key start;
    if (Option.isKey(arg)) {
      // --help;
      addOption(arg)
      continue;
    }
    // 已经有一个值
    if (val) {
      logue.error('The value `%s` has no option key !', arg);
      process.exit(0);
      return;
    }
    val = arg;
  };
  if (key) {
    addOption();
  }
  return ret;
};

exports.Command = function (flag, description, handle) {
  var cmd = new Command(flag, description, handle);
  cmd._parse = cmd.parse;
  cmd.parse = function (argv) {
    argv = Command.parse(argv);
    cmd._parse(argv);
  };
  return cmd;
};