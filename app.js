var config = require('./serverconfig');
var fs = require('fs');
var SocketServer = require("./socketserver/socketserver");
var log = new(require('basic-logger'))({
    showTimestamp: true,
    prefix: "SocketServer"
});
var path = require('path');

if(!config.setup){
	log.error("Please, setup your server by editing the 'serverconfig.js' file");
	return;
}

var server = null;

var webConfig = '// THIS IS AN AUTOMATICALLY GENERATED FILE\n\nvar config=JSON.parse(\'' + JSON.stringify(
	{
		useSSL: config.useSSL,
		serverPort: config.socketServer.port,
		selfHosted: true,
		serverHost: config.socketServer.host
	}
	) + '\')';

if (config.hostWebserver){
	fs.writeFileSync(path.join(__dirname, '/webserver/public/lib/js', 'webconfig.js'), webConfig);
	var webserver = require('./webserver/app');
	server = (config.socketServer.port == config.webServer.port || config.socketServer.port == '') ? webserver.server : null;
}

if (config.apis.musiqpad.sendLobbyStats && (!config.apis.musiqpad.key || config.apis.musiqpad.key == '')) {
	throw 'In order to send stats to the lobby you must generate an key here: https://musiqpad.com/lounge';
}

fs.writeFileSync(path.join(__dirname, '', 'webconfig.js'), webConfig);

var socketServer = new SocketServer(server);

process.on('uncaughtException', function(err) {
  console.log(err);
  console.log(err.stack);
  socketServer.gracefulExit();
});

process.on('exit', socketServer.gracefulExit);

//catches ctrl+c event
process.on('SIGINT', socketServer.gracefulExit);

function fileExistsSync() {
  var exists = false;
  try {
    exists = fs.statSync(path);
  } catch(err) {
    exists = false;
  }

  return !!exists;
}

if(process.argv[2] === "--daemon") {
  if (fileExistsSync(__dirname + '/pidfile')) {
    try {
      var	pid = fs.readFileSync(__dirname + '/pidfile', { encoding: 'utf-8' });
      process.kill(pid, 0);
      process.exit();
    } catch (e) {
      fs.unlinkSync(__dirname + '/pidfile');
    }
  }

  fs.writeFile(__dirname + '/pidfile', process.pid);
}