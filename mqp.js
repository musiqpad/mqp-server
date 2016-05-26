const chalk = require('chalk');
const cproc = require('child_process');
const fs = require('fs');
const daemon = require('daemon');
const path = require('path');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
const boxen = require('boxen');
const update = require('./update');

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
  var notifier = updateNotifier({
    pkg,
    updateCheckInterval: 0
  });
  if(notifier.update) {
    var message = '\n' + boxen('Update available ' + chalk.dim(notifier.update.current) + chalk.reset(' → ') + chalk.green(notifier.update.latest), {
      padding: 1,
      margin: 1,
      borderColor: 'yellow',
      borderStyle: 'round'
    });
    console.log(message);
  }
}

switch(process.argv[2]) {
  case 'start':
    console.log('\nStarting musiqpad');
    console.log('  "' + chalk.yellow.bold('node mqp.js stop') + '" to stop the musiqpad server');
    console.log('  "' + chalk.yellow.bold('node mqp.js log') + '" to view server output');
    console.log('  "' + chalk.yellow.bold('node mqp.js restart') + '" to restart musiqpad');

    // Spawn a new musiqpad daemon process, might need some more settings but I'm waiting for the new config storage for that.
    daemon.daemon(__dirname + "/app.js", "--daemon", {
      stdout: fs.openSync(path.join(process.cwd(), 'log.txt'), 'a'),
    });
    break;
  case 'stop':
		getRunningPid(function(err, pid) {
			if (!err) {
				process.kill(pid, 'SIGTERM');
				console.log('Stopping musiqpad!')
			} else {
				console.log('Musiqpad is already stopped.');
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
		cproc.spawn('tail', ['-F', './log.txt'], {
			cwd: __dirname,
			stdio: 'inherit'
		});
    
    // TODO: use tail module for windows support
		break;
  case 'update':
    getRunningPid(function(err, pid) {
      if (!err) {
        process.kill(pid, 'SIGTERM');
        console.log('Stopping musiqpad!')
      }
      update();
    });
		break;
  default:
    console.log('Welcome to musiqpad!');
    console.log('Usage: node mqp.js {start|stop|restart|log|update}');
    // TODO: Add infos for each cmd
    break;
}
