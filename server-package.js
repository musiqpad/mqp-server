var childProcess = require('child_process');
var psTree = require('ps-tree');
var forever = require('forever');
var log = new(require('basic-logger'))({
    showTimestamp: true,
    prefix: "ServerContainer"
});
var fs = require('fs');

var extend = require('extend');

var server = function (params) {
	var that = this;
	this.settings = {
		forever: {
			enabled: false,
			options: {
				root: './logs',
				pidPath: './pids',
				sockPath: './sock',
				debug: false,
				stream: false
			}
		}
	}
	extend(true, this.settings, params);

	this.start = function() {
    if(this.settings.config) {
      fs.writeFileSync('./config.hjson', this.settings.config, 'utf8');
    }
		if (this.settings.forever.enabled) {
			forever.load(this.settings.forever.options);
			that.pid = forever.start('./start.js');
		}
		else {
			that.proc = runScript('./start.js', function (err) {
				if (err) throw err;
			});
		}
	};

	this.stop = function() {
		stopServer();
	};

	function stopServer() {
		if (that.settings.forever.enabled) {
			forever.stop();
		}
		else {
			that.proc.kill('SIGINT');
			//kill(that.pid);
		}
		log.info('Stopping Server Container');
	}
}

function runScript(scriptPath, callback) {
    var invoked = false;
    var proc = childProcess.fork(scriptPath);

    proc.on('error', function (err) {
        if (invoked) return;
        invoked = true;
        callback(err);
    });

    proc.on('exit', function (code) {
        if (invoked) return;
        invoked = true;
        //var err = code === 0 ? null : new Error('exit code ' + code);
        callback();
    });
	return proc;
}

function kill(pid, signal, callback) {
    signal   = signal || 'SIGKILL';
    callback = callback || function () {};
    var killTree = true;
    if(killTree) {
        psTree(pid, function (err, children) {
            [pid].concat(
                children.map(function (p) {
                    return p.PID;
                })
            ).forEach(function (tpid) {
                try { process.kill(tpid, signal) }
                catch (ex) { }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal) }
        catch (ex) { }
        callback();
    }
};

module.exports = server;