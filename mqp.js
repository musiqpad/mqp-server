const chalk = require('chalk');
const cproc = require('child_process');
const fs = require('fs');
const daemon = require('daemon');
const path = require('path');
const update = require('./update');
const tail = require('file-tail');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');

const notifier = updateNotifier({
  pkg,
  updateCheckInterval: 0,
});
if (notifier.update) {
  console.log('Update available ' + chalk.dim(notifier.update.current) + chalk.reset(' → ') + chalk.green(notifier.update.latest));
} else {
}

function getRunningPid(callback) {
  fs.readFile(__dirname + '/pidfile', {
    encoding: 'utf-8',
  }, function (err, pid) {
    if (err) {
      return callback(err);
    }

    try {
      process.kill(parseInt(pid, 10), 0);
      callback(null, parseInt(pid, 10));
    } catch (e) {
      callback(e);
    }
  });
}

switch (process.argv[2]) {
  case 'start':
    getRunningPid(function (err, pid) {
      if (!err) {
        console.log('Musiqpad is already running!');
      } else {
        console.log('\nStarting musiqpad');
        console.log('  "' + chalk.yellow.bold('npm stop') + '" to stop the musiqpad server');
        console.log('  "' + chalk.yellow.bold('npm run log') + '" to view server output');
        console.log('  "' + chalk.yellow.bold('npm restart') + '" to restart musiqpad');

        // Spawn a new musiqpad daemon process, might need some more settings but I'm waiting for the new config storage for that.
        daemon.daemon(__dirname + '/start.js', '--daemon', {
          stdout: fs.openSync(path.join(process.cwd(), 'log.txt'), 'a'),
        });
      }
    });

    break;
  case 'stop':
    getRunningPid(function (err, pid) {
      if (!err) {
        process.kill(pid, 'SIGTERM');
        console.log('Stopping musiqpad!');
      } else {
        console.log('Musiqpad is already stopped.');
      }
    });

    break;
  case 'restart':
    getRunningPid(function (err, pid) {
      if (!err) {
        process.kill(pid, 'SIGTERM');
        console.log('\nRestarting musiqpad');
        daemon.daemon(__dirname + '/start.js', '--daemon', {
          stdout: fs.openSync(path.join(process.cwd(), 'log.txt'), 'a'),
        });

      } else {
        console.log('musiqpad could not be restarted, as a running instance could not be found.');
      }
    });

    break;
  case 'log':
    console.log('Type ' + 'Ctrl-C ' + 'to exit');

    ft = tail.startTailing('./log.txt');
    ft.on('line', function (line) {
      console.log(line);
    });

    break;

  case 'update':
    getRunningPid(function (err, pid) {
      if (!err) {
        process.kill(pid, 'SIGTERM');
        console.log('Stopping musiqpad!');
      }

      update();
    });

    break;
  default:
    console.log('Welcome to musiqpad!');
    console.log('Usage: npm run {start|stop|restart|log|update}');
    // TODO: Add infos for each cmd
    break;
}
