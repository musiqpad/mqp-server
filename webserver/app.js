var express = require('express');
var compression = require('compression');
var path = require('path');
var http = require('http');
var https = require('https');
var fs = require('fs');
const nconf = require('nconf');

var app = express();
var server = null;
var server2 = null;
var socketServer = null;

if (nconf.get('useSSL') && nconf.get('certificate') && nconf.get('certificate:key') && nconf.get('certificate:cert')) {
  const certificate = {
    key: fs.readFileSync(nconf.get('certificate:key')),
    cert: fs.readFileSync(nconf.get('certificate:cert')),
  };
  server = https.createServer(certificate, app);
  if (nconf.get('webServer:redirectHTTP') && nconf.get('webServer:redirectPort') !== '') {
    server2 = http.createServer(app);
  }
}
else {
  server = http.createServer(app);
}

app.use(compression());

if(nconf.get('webServer:redirectHTTP'))
  app.use(function(req, res, next) {
    if(!req.secure) {
  	  return res.redirect(['https://', req.hostname, ":", nconf.get('webServer:port') || process.env.PORT, req.url].join(''));
    }
    next();
  });

app.use(express.static(path.resolve(__dirname, 'public')));
app.use('/pads', express.static(path.resolve(__dirname, 'public')));
app.get('/config', function(req, res) {
  res.setHeader("Content-Type", "application/javascript");
  res.send(fs.readFileSync(__dirname + '/public/lib/js/webconfig.js'));
});
app.get('/api/room', function(req, res) {
  var roomInfo = {
    "slug": nconf.get('room:slug'),
    "name": nconf.get('room:name'),
    "people": null,
    "queue": null,
    "media": null,
  };
  res.send(roomInfo);
});

server.listen(nconf.get('webServer:port') || process.env.PORT, nconf.get('webServer:address') || process.env.IP, function(){
  var addr = server.address();
  console.log("Webserver listening at", addr.address + ":" + addr.port);
});

if(server2 != null){
  server2.listen(nconf.get('webServer:redirectPort') || 80, nconf.get('webServer:address') || process.env.IP, function(){
    var addr2 = server2.address();
    console.log("HTTP Webserver listening at", addr2.address + ":" + addr2.port);
  });
}

var setSocketServer = function(ss){
  socketServer = ss;
};


module.exports = {app: app, server: server, server2: server2, setSocketServer: setSocketServer};
