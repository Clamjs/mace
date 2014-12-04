var url = require('url');
var net = require('net');
var util = require('../');
var debug = util.debug('Socks5');
var pacServer,socksServer;
var _STATUS = {
  waiting: 'waiting',
  shaking: 'shaking',
  connect: 'connect',
  failed: 'failed'
};
var ATYP = {
  IP_V4: 0x01,
  DNS: 0x03,
  IP_V6: 0x04
};
var AUTHENTICATION = {
  NOAUTH: 0x00,
  GSSAPI: 0x01,
  USERPASS: 0x02,
  NONE: 0xFF
};
var REQUEST_CMD = {
  CONNECT: 0x01,
  BIND: 0x02,
  UDP_ASSOCIATE: 0x03
};
function Socks5 (port, pacPort) {
  if (!(this instanceof Socks5)) {
    return new Socks5(port, pacPort);
  } 
  if (port) {
    this.listen(port, pacPort);
  }
}
Socks5.version = 5;

util.inherits(Socks5, {
  '_onBindConnect': function (proxy, client) {
    var address = proxy.address();
    proxy.on('data', function (chunk) {
      if (client.writable) {
        debug('proxy %s response', proxy._host, chunk);
        client.write(chunk);
      }
    });
    client.on('data', function (chunk) {
      try{
        debug('proxy %s request', proxy._host, chunk.toString());
        proxy.write(chunk);
      } catch(e){}
    });

    debug('proxy %s address %s:%s type: %s', proxy._host, address.address, address.port, address.family);
    // IPv4
    client.write(new Buffer([
      0x05, 0x00, 0x00,
      0x01,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00
    ]));
    client.resume();
  },
  '_onHandleConnect': function (chunk, client) {
    var self = this;
    var port = chunk.slice(chunk.length - 2);
    port = port.readUInt16BE(0);
    var hostname;
    var type = chunk[3];
    if (type === ATYP.IP_V4) {
      type = 'IPv4';
      hostname = util.format('%s.%s.%s.%s', chunk[4], chunk[5], chunk[6], chunk[7]);
    } else if (type === ATYP.DNS) {
      type = 'DNS';
      hostname = chunk.toString('utf8', 5, 5 + chunk[4]);
    } else if (type === ATYP.IP_V6) {
      type = 'IPv6';
      hostname = chunk.slice(chunk[4], chunk[20]).toString('utf8');
    } else {
      debug.error('Not support this ATYP(%s).', type);
      client.end(new Buffer([0x05,0xff]));
    }
    
    var host = hostname + ':' + port;
    debug.log('on handle connect of address %s (%s)', host, type, chunk);

    var proxy = net.connect(port, hostname);
    proxy._host = host;
    client._host = host;
    proxy.once('connect', function () {
      debug('proxy %s connected', host);
      self._onBindConnect(proxy, client);
    }).on('error', function (e) {
      debug('proxy %s error', host, e);
      client.end();
    });
  },
  '_onHandleShake': function (chunk, client) {
      debug.log('on handle shake', chunk);
      var self = this;
      var _err = new Buffer([0x05,0xff]);
      var _sus = new Buffer([0x05, 0x00]);
      if (chunk.length < 2) {
        debug.error('chunk data error');
        return client.end(_err);
      }
      if (Socks5.version !== chunk[0]) {
        debug.error('version not matched! Only support `version:'+Socks5.version+'`');
        return client.end(_err);
      }
      if (REQUEST_CMD.CONNECT !==chunk[1]) {
        debug.error('method not connect');
        return client.end(_err);
      }
      debug('emit %s', "connecting");
      client.once('data', function (chunk) {
        debug('emit %s', 'proxy:bind');
        client.pause();
        self._onHandleConnect(chunk, client);
      });
      return client.write(_sus);
  },
  '_onConnected': function (client) {
    var self = this;
    self._connections += 1;
    'close error'.split(' ').forEach(function (e) {
      client.on(e, function (msg){
        client.destroy();
        self._connections -= 1;
        debug('client %s %s: %s', client._host, e, msg);
      });
    });
    client.once('data', function (chunk) {
      self._onHandleShake(chunk, client);
    }).setTimeout(4000);
  },
  'listen': function (port, pacPort) {
    if (this.server) {return this;}
    var self = this;
    self._connections = 0;
    var port = this.port = port || 9001;
    var server = this.server = net.createServer({
      allowHalfOpen: true
    },this._onConnected.bind(this)).listen(port);
    server.on('error', function (e) {
      debug.error(e);
    });
    server.on('listening', function () {
      util.log('Listen 127.0.0.1:' + port);
      if (pacPort) {
        require('http').createServer(function (req, res) {
          var urlInfo = url.parse(req.url);
          // 
          if (!urlInfo.pathname.match(/.*\.pac$/i)) {
            return res.end('Error: not found handle');
          }
          res.writeHeader(200, {
            'Content-Type': 'application/octet-stream'
          });
          var hostname = self.hostname = req.headers.host.split(':').shift();
          var pacContent = FindProxyForURL.toString().replace(/\$\{HOST\}/g, hostname + ':' + port);
          debug.log(pacContent);
          res.end(pacContent);
        }).listen(pacPort, function () {
          // 
          util.log('PAC address: http://127.0.0.1:' + pacPort + '/proxy.pac');
        });
      }
    });
  }
}, require('events').EventEmitter);


function FindProxyForURL(url, host) {
  return 'SOCKS5 ${HOST}; SOCKS ${HOST}; DIRECT;';
}
function joinBuffer(old, newer) {
  if (!old) return newer;
  var newBuf = new Buffer(old.length + newer.length);
  old.copy(newBuf);
  newer.copy(newBuf, old.length);
  return newBuf;
}
socksServer = new Socks5(9001, 80);