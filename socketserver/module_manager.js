var log = new (require('basic-logger'))({showTimestamp: true, prefix: 'ModuleManager'})

var Module = require('./module');

var ModuleManager = function() {
  this.modules = {};
  this.__events = {};
};

ModuleManager.prototype.test = function () { console.log('Test2'); };

ModuleManager.prototype.RegisterEvent = function(event, callback, module) {
  if (typeof callback !== 'function') throw new Exception('Callback must be a function.');
  event = event.toUpperCase();
  var eventParts = event.split('.');
  var currentLevel = null;
  for (var i = 0, len = eventParts.length; i < len; i++) {
    if (currentLevel == null) currentLevel = this.__events;

    if (eventParts.length >= (i + 2) && eventParts[i + 1] == '*') {
      currentLevel = currentLevel[eventParts[i]] = {__events:[]};
      break;
    }
    if (currentLevel[eventParts[i]]) {
      currentLevel = currentLevel[eventParts[i]];
    }
    else {
      currentLevel = currentLevel[eventParts[i]] = {__events:[]};
    }
  }
  currentLevel.__events.push({ cb:callback });
  console.log(JSON.stringify(this.__events));
//  if (!this.__events[event]) {
//    this.__events[event] = [];
//  }
//  this.__events[event].push({ cb:callback, module:module });
};

ModuleManager.prototype.DispatchEvent = function(event, data) {
  event = event.toUpperCase();
  var eventParts = event.split('.');
  var currentLevel = this.__events;
  if (!currentLevel) return;
  for (var i = 0, len = eventParts.length; i < len; i++) {
    if (currentLevel[eventParts[i]]) currentLevel = currentLevel[eventParts[i]];
    else break;
    if (currentLevel.__events && currentLevel.__events.length > 0) {
      for (var ie = 0, elen = currentLevel.__events.length; ie < elen; ie++) {
        currentLevel.__events[ie].cb(data);
      }
    }
  }

//  if (currentLevel && currentLevel.__events && currentLevel.__events.length > 0) {
//    for (var ie = 0, elen = currentLevel.__events.length; ie < elen; ie++) {
//      currentLevel.__events[ie].cb(data);
//    }
//  }
//  if (this.__events[event]) {
//    for (var i = 0, len = this.__events[event].length; i < len; i++) {
//      if (this.__events[event][i].cb) {
//        try {
//          this.__events[event][i].cb(data);
//        }
//        catch (e) {
//          this.__events[event][i].module.Logger.error('Failed to run callback for event \'' + event + '\'');
//        }
//      }
//    }
//  }
};

ModuleManager.prototype.LoadModules = function(dir) {
  var moduleCount = 0;
	var currentCount = 0;
  var that = this;
  require('fs').readdirSync(__dirname + dir).forEach(function(file) {
  	if (file.match(/\.js$/) !== null) {
			currentCount++;
			moduleCount++;
    	var name = file.replace('.js', '');
			log.info('Loading module \'' + name + '\' (' + currentCount + ')');
    	that.modules[name] = new (require(__dirname + dir + file))(new Module(name));
  	}
	});
	log.info('Loaded ' + moduleCount + ' Module(s)');
};

module.exports = new ModuleManager();
