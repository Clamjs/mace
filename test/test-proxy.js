var http = require('http');
var spdy = require('spdy');
var fs = require('fs');
var net = require('net');
// https://github.com/jvansteirteghem/jap/blob/master/JAP_LOCAL_WS_NODE/JAP/JAP_LOCAL_WS.js

// http.createServer(function (req, res) {
//   var urlInfo = require('url').parse(req.url, true).pathname;
//   var ip = req.headers.host.split(':').shift();
//   if (urlInfo.match(/\.pac/i)) {
//     return 'PROXY '+ ip +'; DIRECT;';
//   }
//     res.end('http server runing');
  
// }).listen(80);
// spdy.createServer({
//   key: fs.readFileSync('./spdy-key.pem'),
//   cert: fs.readFileSync('./spdy-cert.pem')
// }, function (req, res) {
//   res.end('spdy server runing');
// }).listen(443);

var proxy = net.createConnection(1080,"127.0.0.1");
proxy.on('connect', function () {
  proxy.on('data', function (chunk) {
    console.log(chunk);
  });
}).on('error', function (e) {
  console.log(e);
});