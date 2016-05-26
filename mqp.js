const chalk = require('chalk');
const cproc = require('child_process');
const fs = require('fs');
const daemon = require('daemon');
const path = require('path');

function getRunningPid(callback) {
  fs.readFile(__dirname + '/pidfile', {
    encoding: 'utf-8'
  }, function(err, pid) {
    if (err) {
      return callback(err);
    }

    try {
      process.kill(parseInt(pid, 10), 0);
      callback(null, parseInt(pid, 10));
    } catch(e) {
      callback(e);
    }
  });
}

function checkForUpdates() {
  
}

switch(process.argv[2]) {
  case 'start':
    console.log('\nStarting musiqpad\n');
    console.log('  "' + chalk.yellow.bgBlue.bold('node mqp.js stop') + '" to stop the musiqpad server');
    console.log('  "' + chalk.yellow.bgBlue.bold('node mqp.js log') + '" to view server output\n');
    console.log('  "' + chalk.yellow.bgBlue.bold('node mqp.js restart') + '" to restart musiqpad\n');

    // Spawn a new musiqpad daemon process
    daemon.daemon(__dirname + "/app.js", "--daemon", {
      stdout: fs.openSync(path.join(process.cwd(), 'log.txt'), 'a'),
    });
    break;
  case 'stop':
		getRunningPid(function(err, pid) {
			if (!err) {
				process.kill(pid, 'SIGTERM');
				console.log('Stopping musiqpad.!')
			} else {
				console.log('musiqpad is already stopped.');
			}
		});
		break;
  case 'restart':
		getRunningPid(function(err, pid) {
			if (!err) {
				process.kill(pid, 'SIGHUP');
				console.log('\nRestarting musiqpad'.bold);
			} else {
				console.log('musiqpad could not be restarted, as a running instance could not be found.');
			}
		});
		break;
  case 'log':
		console.log('Type ' + 'Ctrl-C ' + 'to exit');
		cproc.spawn('tail', ['-F', './logs/output.log'], {
			cwd: __dirname,
			stdio: 'inherit'
		});
    
    // TODO: use tail module for windows support
		break;
  case 'update':
		console.log('Not available yet.');
		break;
  default:
    console.log('Welcome to musiqpad!');
    console.log('Usage: node mqp.js {start|stop|restart|log|update}');
    // TODO: Add infos for each cmd
    break;
}
