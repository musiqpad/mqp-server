function ExampleModule(module) {
  var that = this;
  this.module = module;
  this.module.SetName('Example Module v0.1');

  this.module.RegisterEvent('ROOM.*', function (data) { that.module.Logger.info('ROOM: ' + JSON.stringify(data)); });
  this.module.RegisterEvent('ROOM.USER.*', function (data) { that.module.Logger.info('ROOM.USER: ' + JSON.stringify(data)); });
  this.module.RegisterEvent('ROOM.USER.MAKE_OWNER', function (data) { that.module.Logger.info('ROOM.USER.MAKE_OWNER: ' + JSON.stringify(data)); });
  this.module.RegisterEvent('ROOM.CHAT.*', function (data) { that.module.Logger.info('ROOM.CHAT: ' + JSON.stringify(data)); });
};

module.exports = ExampleModule;
