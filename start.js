var config = require('./serverconfig');
var fs = require('fs');
var SocketServer = require("./socketserver/socketserver");
var log = new(require('basic-logger'))({
    showTimestamp: true,
    prefix: "SocketServer"
});
////var SocketServer = require("./socketserver_mysql/socketserver");

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
	fs.writeFile('./webserver/public/lib/js/webconfig.js', webConfig);
	// but works to me with fs.writeFile('./webserver/public/lib/js/'+config.room.slug+'-config.js', webConfig); --> caipira
	var webserver = require('./webserver/app');
	server = (config.socketServer.port == config.webServer.port || config.socketServer.port == '') ? webserver.server : null;
}

if (config.apis.musiqpad.sendLobbyStats && (!config.apis.musiqpad.key || config.apis.musiqpad.key == '')) {
	throw 'In order to send stats to the lobby you must generate an key here: https://musiqpad.com/lounge';
}

fs.writeFile('./webconfig.js', webConfig);
var socketServer = new SocketServer(server);

process.on('uncaughtException', function(err) {
  console.log(err);
  console.log(err.stack);
  socketServer.gracefulExit();
});

process.on('exit', socketServer.gracefulExit);

//catches ctrl+c event
process.on('SIGINT', socketServer.gracefulExit);
