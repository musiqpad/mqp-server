function Module(name) {
  var that = this;
  this.ModuleManager = require('./module_manager');
  this.ModuleName = name;
  this.Logger = new (require('basic-logger'))({showTimestamp: true, prefix: that.ModuleName});
  this.RegisterEvent = function(event, callback) { that.ModuleManager.RegisterEvent(event, callback, this) };
  this.SetName = function(name) {
    that.ModuleName = name;
    that.Logger = new (require('basic-logger'))({showTimestamp: true, prefix: that.ModuleName});
  };
};

module.exports = Module;
