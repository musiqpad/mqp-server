var express = require('express');
var path = require('path');
var http = require('http');
var https = require('https');
var fs = require('fs');
var config = require('../serverconfig.js');

// CSS requires 
var less = require('less');
var cleancss = (new (require('clean-css')));


var app = express();
var server = null;
var server2 = null;
var socketServer = null;

if (config.certificate && config.certificate.key && config.certificate.cert){
  server = https.createServer(config.certificate, app);
  if(config.webServer.redirectHTTP && config.webServer.redirectPort != ''){
    server2 = http.createServer(app);
  }
}else{
	server = http.createServer(app);
}

//var server = http.createServer(app);

// app.get(/\.css/i, function(req, res){
//   fs.readFile( path.resolve(__dirname, 'public/' + req.originalUrl), function(err, data){
//     if (err){
//       res.status('404');
//       res.send('File not found');
//       return;
//     }
//     res.set("Content-type", "text/css");
//     res.send(cleancss.minify(data).styles);
//   })
// });

app.use(function(req, res, next) {
  if(!req.secure && config.webServer.redirectHTTP) {
	  return res.redirect(['https://', req.hostname, ":", config.webServer.port || process.env.PORT, req.url].join(''));
  }
  next();
});

app.use(express.static(path.resolve(__dirname, 'public')));
app.use('/pads', express.static(path.resolve(__dirname, 'public')));
app.get('/config', function(req, res) {
    res.send(fs.readFileSync(__dirname + '/public/lib/js/webconfig.js'));
});
app.get('/api/room', function(req,res){
  var roomInfo = {
    "slug": config.room.slug,
    "name": config.room.name,
    "people": null,
    "queue": null,
    "media": null,
  };
  res.send(roomInfo);
});

// app.get('*/css/style.css', function(req, res){
//   less.render('@import "public/css/style.less";', {},
//       function (e, output) {
//         res.header("Content-type", "text/css");
//         res.send(cleancss.minify(output.css).styles);
//       });
// });

server.listen(config.webServer.port || process.env.PORT, config.webServer.address || process.env.IP, function(){
  var addr = server.address();
  console.log("Webserver listening at", addr.address + ":" + addr.port);
});

if(server2 != null){
  server2.listen(config.webServer.redirectPort || 80, config.webServer.address || process.env.IP, function(){
    var addr2 = server2.address();
    console.log("HTTP Webserver listening at", addr2.address + ":" + addr2.port);
  });
}

var setSocketServer = function(ss){
  socketServer = ss;
};


module.exports = {app: app, server: server, server2: server2, setSocketServer: setSocketServer};