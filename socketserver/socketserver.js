//Modules
var ws = require('ws');
var http = require('http');
var https = require('https');
var Duration = require('durationjs');
var request = require('request');
var util = require('util');
var extend = require('extend');

//Files
var config = require('../serverconfig');
var DB = require("./database");
var Room = require('./room');
var User = require('./user');
var Mailer = require('./mailer');
var YT = require('./YT');
var Roles = require('./role');
var Hash = require('./hash');
var log = new (require('basic-logger'))({showTimestamp: true, prefix: "SocketServer"});
var WebSocketServer = ws.Server;
var ModuleManager = require('./module_manager');

ws.prototype.sendJSON = function(obj){
	try {
		this.send( JSON.stringify( obj ) );
	} catch (e){}
};

Date.prototype.addMinutes = function(m) {
   this.setTime(this.getTime() + (m*60*1000));
   return this;
};

Date.prototype.addHours = function(h) {
   this.setTime(this.getTime() + (h*60*60*1000));
   return this;
};

Date.prototype.addDays = function(days){
    this.setDate(this.getDate() + days);
    return this;
};

var SocketServer = function(server){
	var that = this;

	this.authdSockets = { // Key: uid, Value: socket obj
		data: {},
		add: function(sock){
			this.data[ sock.user.uid ] = sock;
			sock.temp_uptime = 0;
		},
		remove: function(sock){
			delete this.data[ sock.user.uid ];
		},
		find: function(uid){
			return this.data.filter(function(e, i, a){
				return e.user.uid == uid;
			})[0];
		}
	};
	this.unauthdSockets = { // Socket objects
		data: [],
		add: function(sock){
			if (this.data.indexOf(sock) > -1) return;
			this.data.push(sock);
		},
		remove: function(sock){
			var ind = this.data.indexOf(sock);

			if (ind == -1) return;

			this.data.splice(ind, 1);
		}
	};
	this.disconnectedAuthdSockets = { // Key: uid, Value: socket obj
		data: {},
		add: function(sock){
			if (!sock || !sock.user)	return;

			if (this.data.hasOwnProperty(sock.user.uid)) {
				this.remove(this.data[sock.user.uid].sock);
			}
			if (sock.room && (that.room.queue.isPlaying(sock) || that.room.queue.checkQueuePos(sock) > -1)) {
				this.data[ sock.user.uid ] = {
					sock: sock,
					timeout: setTimeout(function(){
						if ( sock.room ) that.room.removeUser(sock);
						that.disconnectedAuthdSockets.remove(sock);
					}, 300e3)
				};
			}
			else if (sock.room) that.room.removeUser(sock);
		},
		remove: function(sock){
			if (!sock || !sock.user || !this.data.hasOwnProperty(sock.user.uid)) return;

			var _sock = this.data[sock.user.uid];
			clearTimeout(_sock.timeout);
			delete this.data[ sock.user.uid ];
		}
	};

	this.ipRateLimit = {
		conAttemptsAllowed: 3,
		conMillisUntilReset: 20000,
		messAttemptsAllowed: 20, // This should be more than the socket ratelimit if the time is higher than the socket ratelimit
		messMillisUntilReset: 4000, // This should be the same or more than the socket-implemented message ratelimit
		maxHits: 10, // Max hits before connection is permanently denied
		addresses: {},
		canConnect: function(ip){
//			if (ip == '127.0.0.1') return true;
			if (ip.indexOf('127.') == 0) return true;

			if (!this.addresses[ip]) this.addresses[ip] = {
				conAttempts: [],
				messAttempts: [],
				hits: 0,
				warned: false
			};

			if (this.addresses[ip].hits > this.maxHits){
				log.info(ip + ' connect denied due to ratelimit (permanent)');
				return false;
			}

			var time = Date.now();

			if (this.addresses[ip].conAttempts[ this.conAttemptsAllowed - 1 ] && (time - this.addresses[ip].conAttempts[ this.conAttemptsAllowed - 1 ]) < this.conMillisUntilReset){
				log.info(ip + ' connect denied due to ratelimit');

				if (!this.addresses[ip].warned)
					this.addresses[ip].hits++;

				this.addresses[ip].warned = true;
				return false;
			}

			this.addresses[ip].conAttempts.unshift(time);

			if (this.addresses[ip].conAttempts.length > this.conAttemptsAllowed) this.addresses[ip].conAttempts.pop();

			this.addresses[ip].warned = false;

			return true;
		},
		canAcceptMessage: function(ip){
//			if (ip == '127.0.0.1') return true;
			//OpenShift: localhost starts with 127, but isn't equals the common localhost address
			if (ip.indexOf('127.') == 0) return true;

			if (!this.addresses[ip]) this.addresses[ip] = {
				conAttempts: [],
				messAttempts: [],
				hits: 0,
				warned: false
			};

			var time = Date.now();

			if (this.addresses[ip].messAttempts[ this.messAttemptsAllowed - 1 ] && (time - this.addresses[ip].messAttempts[ this.messAttemptsAllowed - 1 ]) < this.messMillisUntilReset){
				log.info(ip + ' message denied due to ratelimit');
				if (!this.addresses[ip].warned)
					this.addresses[ip].hits++;

				this.addresses[ip].warned = true;
				return false;
			}

			this.addresses[ip].messAttempts.unshift(time);

			if (this.addresses[ip].messAttempts.length > this.messAttemptsAllowed) this.addresses[ip].messAttempts.pop();

			this.addresses[ip].warned = false;

			return true;
		}
	};

	//Uptime calculator
	setInterval(function(){
		for(var index in that.authdSockets.data){
			var usr = that.authdSockets.data[index].user;
			usr.uptime += Date.now() - usr.temp_uptime;
			usr.temp_uptime = Date.now();
		}
	}, 5 * 60 * 1000);

	var settings = {
		autoAcceptConnections : true
	};

	if (server){
		settings.server = server;
	}else{
		var port = config.socketServer.port || undefined;
		var ip = config.socketServer.host || undefined;

		if (config.certificate && config.certificate.key && config.certificate.cert){
			settings.server = https.createServer(config.certificate).listen(port,ip);
		}else{
			settings.server = http.createServer().listen(port,ip);
		}
	}

	this.wss = new WebSocketServer(settings);
	log.info('Socket server listening on port ' + (config.socketServer.port || config.webServer.port));

//	this.wss = new WebSocketServer({ port: config.socketServer.port });
//	log.info('Socket server listening on port ' + config.socketServer.port);

	this.room = new Room(this, config.room);

	// Keepalive packets.  This.... is messy.
	setInterval( function(){
		for (var i in that.authdSockets.data){
			try{
				that.authdSockets.data[i].send('h');
			}catch (e){ log.debug('Socket not active for keepalive');}
		}

		for (var j = 0; j < that.unauthdSockets.data.length; j++){
			try{
				that.unauthdSockets.data[j].send('h');
			}catch (e){ log.debug('Socket not active for keepalive');}
		}
	}, 6000);
	ModuleManager.LoadModules('/../mp_modules/');

	this.wss.on("connection", function(socket){
		var ip = (socket.upgradeReq.headers['x-forwarded-for'] || socket.upgradeReq.connection.remoteAddress);

		log.info(ip + ' connected');

		if (!that.ipRateLimit.canConnect(ip)){
			socket.terminate();
			return;
		}

		socket.ratelimit = {
			lastReset: 0,
			isCooldown: false,
			frameCount: 0,
			hasWarned: false,
			ratelimitHits: 0,
			canAcceptMessage: function() {
				this.frameCount++;
				if (this.lastReset == 0 || (this.lastReset  + 1000) < Date.now() && !this.isCooldown) {
					this.lastReset = Date.now();
					this.frameCount = 0;
					this.hasWarned = false;
				}
				else if (this.frameCount > 10) {
					if (!this.isCooldown) {
						this.ratelimitHits++;
						if (this.ratelimitHits >= 3) {
							return null;
						}
						else {
							var that = this;
							this.isCooldown = true;
							setTimeout(function() {
								that.lastReset = Date.now();
								that.frameCount = 0;
								that.hasWarned = false;
								that.isCooldown = false;
							}, 2500);
						}
					}
					return false;
				}
				return true;
			}
		};

		that.unauthdSockets.add(socket);

		socket.on("close", function(){
			var ip = (socket.upgradeReq.headers['x-forwarded-for'] || socket.upgradeReq.connection.remoteAddress);

			log.info(ip + ' disconnected');
			if(socket.user){
				socket.user.uptime += Date.now() - socket.user.temp_uptime;
				socket.user.temp_uptime = 0;
			}
			that.removeSock(socket);
		});


		socket.on("message", function(data, flags){
			var ip = (socket.upgradeReq.headers['x-forwarded-for'] || socket.upgradeReq.connection.remoteAddress);

			log.debug(ip + " sent: " + data);

			try {
				data = JSON.parse(data);
			} catch (e) {
				return;
			}

			//Check if being ratelimited
			if (!socket.ratelimit || socket.ratelimit.isLocked) return;

			// This is a harsher ratelimit because it means they're doing it from multiple sockets
			// Does not disconnect sockets from this IP that aren't spamming, but will if they sends a message
			if (!that.ipRateLimit.canAcceptMessage(ip)){
				socket.terminate();
				return;
			}

			//Check if type is set
			if (!data.type) return;

			data.data = data.data || {};

			var returnObj = {type: 'response', requestType: data.type };

			// Used for discerning callbacks client-side
			if (data.id) returnObj.id = data.id;

			var canAcceptMessage = socket.ratelimit.canAcceptMessage();
			if (canAcceptMessage === false) {
				if (!socket.ratelimit.hasWarned) {
					socket.ratelimit.hasWarned = true;
					socket.sendJSON({type:'systemMessage', data:'WARNING! You are sending too many requests too quickly. If you continue to send too many you may be locked out.'});
				}
				return;
			}
			else if (canAcceptMessage === null) {
				socket.sendJSON({type:'systemMessage', data:'WARNING! You have been locked out due to sending too many requests too quickly. Please refresh to continue using the site.'});
				socket.close(1000, JSON.stringify({
					type: 'ratelimit'
				}));
				return;
			}

			// Return if unauthenticated socket or banned or restricted user tries to do anything other than signup, login, or join room.
			var restricted = false;
			if((!socket.user || (socket.room && that.room.isUserBanned(socket.user.uid)) || (restricted = (Date.now() - socket.user.created) <= config.room.signupcd) || socket.user.confirmation) &&
				['signup', 'login', 'joinRoom', 'getUsers', 'getHistory', 'getStaff', 'getBannedUsers', 'confirmation', 'recovery'].indexOf(data.type) == -1){

				returnObj.data = {error: 'NotLoggedIn'};

				if (socket.user) {
					if(socket.user.confirmation){
						returnObj.data = {error: 'EmailNotConfirmed'};
					} else {
						returnObj.data = {error: 'UserBanned'};
					}
				} else if (restricted) {
					returnObj.data = {error: 'UserRestricted'};
				}

				socket.sendJSON(returnObj);
				return;
			}

			switch(data.type){
				case 'confirmation':
					/*
				    Expected input object:
					{
						type: 'confirmation',
						data: {
							code: code
						}
					}
					*/
					if((returnObj.data = { success: (socket.user.confirmation == data.data.code), }).success) socket.user.confirmation = null;
					socket.sendJSON(returnObj);
					break;
				case 'recovery':
					/*
				    Expected input object:
					{
						type: 'recovery',
						data: {
							email: email,
							code: code (optional, if not present will generate new code)
							newpass: newpass ( only if code is present)
						}
					}
					*/
					//Check if recovery is enabled
					if (!(config.room.allowrecovery)){
						returnObj.data = {
							error: 'RecoveryDisabled'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Check for props
					if (!(data.data && data.data.email && (Boolean(data.data.code) == Boolean(data.data.newpass)))){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var sendRecovery = function(user){
						//Generate new code and send email
						user.recovery = Hash.md5(Date.now() + '', user.un);
						Mailer.sendEmail('recovery', {
							user: user.un,
							code: user.recovery.code,
							email: data.data.email,
							timeout: (new Date().addDays(1)).toISOString().replace(/T/, ' ').replace(/\..+/, '') + ' UTC',
						}, data.data.email, function(err, data){
							if(err){
								returnObj.data = {
									error: 'EmailAuthIssue',
								}
							} else {
								returnObj.data = {
									success: 'true',
								}
							}
							socket.sendJSON(returnObj);
						});
					};

					//Check for user with email
					DB.getUser(data.data.email, function(err, user){
						//Handle error
						if(err){
							returnObj.data = {
								error: 'UserDoesNotExist',
							};
							return;
						}

						//Check awaiting recovery
						if(user.recovery.code){

							//If recovery code is specified
							if(data.data.code){

								//If code is not timeouted
								if(user.recovery.timeout > Date.now()){

									//Successful password reset
									if(data.data.code == user.recovery.code){
										user.pw = data.data.newpass;
										user.recovery = null;
										returnObj.data = {
											success: true,
										};
									} else {
										returnObj.data = {
											error: 'WrongRecoveryCode',
										};
									}
								} else {
									returnObj.data = {
										error: 'RecoveryTimeout',
									};
								}
							} else {
								if(user.recovery.timeout > Date.now()){ //Awaiting recovery
									returnObj.data = {
										error: 'AwaitingRecovery',
									};
								} else { //Generate new recovery code
									sendRecovery(user);
								}
							}
							socket.sendJSON(returnObj);
						} else if (!data.data.code) {
							//Generate new recovery code and send email
							sendRecovery(user);
						} else {
							returnObj.data = {
								error: 'WrongProps',
							};
							socket.sendJSON(returnObj);
						}
					});
					break;
				case 'logout':
					/*
				    Expected input object:
					{
						type: 'logout'
					}
					*/

					if (!socket.user) break;
					var inRoom;

					if (socket.room) {
						inRoom = true;
						that.room.removeUser(socket);
					}else{
						inRoom = false;
					}

					that.authdSockets.remove(socket);
					that.unauthdSockets.add(socket);
					socket.user = null;

					if (inRoom) that.room.addUser(socket);

					returnObj.data = {success: true};

					if (data.id){
						socket.sendJSON(returnObj);
					}
					break;

				case 'getRoomInfo':
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {
						name: that.room.getRoomMeta().name,
						slug: that.room.getRoomMeta().slug,
						greet: that.room.getRoomMeta().greet,
						bg: that.room.getRoomMeta().bg,
						people: that.room.getUsersObj().length,
						queue: that.room.queue.makeClientObj().length,
						media: that.room.queue.currentdj == null ? null : that.room.queue.currentsong,
						staffroles: Roles.getStaffRoles()
					};
					socket.sendJSON(returnObj);
					break;

				case 'getUsers':
					/*
				    Expected input object:
					{
						type: 'getUsers'
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = that.room.getUsersObj();
					socket.sendJSON(returnObj);
					break;

				case 'getStaff':
					/*
				    Expected input object:
					{
						type: 'getStaff'
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					that.room.getRoomStaff(function(err, staff){
						console.log(err);
						returnObj.data = staff;
						socket.sendJSON(returnObj);
					});
					break;

				case 'getBannedUsers':
					/*
				    Expected input object:
					{
						type: 'getBannedUsers'
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					that.room.getBannedUsers(function(err, bans){
						console.log(err);
						returnObj.data = bans || [];
						socket.sendJSON(returnObj);
					});
					break;

				case 'getHistory':
					/*
				    Expected input object:
					{
						type: 'getHistory'
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = that.room.getHistoryObj() || [];
					socket.sendJSON(returnObj);
					break;

				case 'joinRoom':
					/*
				    Expected input object:
					{
						type: 'joinRoom'
					}
					*/
					if (!socket.room) {
/*						returnObj.data = {
							error: 'AlreadyInRoom'
						};
						socket.sendJSON(returnObj);
						break;
*/						that.room.addUser( socket );
					}

//					that.room.addUser( socket );

					returnObj.data = {
						success: true,
						room: that.room.getRoomMeta(),
						queue: {
							limit: that.room.queue.limit,
							users: that.room.queue.makeClientObj(),
							currentdj: that.room.queue.currentdj == null ? null : that.room.queue.currentdj.user.uid,
							currentsong: that.room.queue.currentdj == null ? null : that.room.queue.currentsong,
							songStart: that.room.queue.songstart,
							time: that.room.queue.getCurrentTime(),
							cycle: that.room.queue.cycle,
							lock: that.room.queue.lock,
							votes: that.room.queue.makeVoteObj(),
							vote: that.room.queue.getUserVote( socket ),
						},
						historylimit: config.room.history.limit_send,
						roles: Roles.makeClientObj(),
						roleOrder: Roles.getOrder(),
						staffRoles: Roles.getStaffRoles(),
						lastChat: that.room.makePrevChatObj(),
						time: new Date().getTime(),
						captchakey: config.apis.reCaptcha.key,
						allowemojis: config.room.allowemojis,
						description: config.room.description,
						recaptcha: config.room.recaptcha,
					};

					socket.sendJSON(returnObj);

					break;
				case 'getCurrentSongTime':
					/*
				    Expected input object:
					{
						type: 'getCurrentSongTime'
					}
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {
						success: true,
						time: that.room.queue.getCurrentTime()
					};


					socket.sendJSON(returnObj);

					break;
				case 'leaveRoom':
					/*
				    Expected input object:
					{
						type: 'leaveRoom'
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					that.room.removeUser( socket );

					returnObj.data = {success: true};

					if (data.id){
						socket.sendJSON(returnObj);
					}
					break;

				case 'djQueueJoin':
					/*
					 Expects {
					 	type: 'djQueueJoin',
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.join')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (that.room.queue.users.length >= that.room.queue.limit && !Roles.checkPermission(socket.user.role, 'djqueue.limit.bypass')){
						returnObj.data = {
							error: 'CannotJoinQueueOverLimit'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (that.room.queue.lock && !Roles.checkPermission(socket.user.role, 'djqueue.lock.bypass')){
						returnObj.data = {
							error: 'CannotJoinLockedQueue'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!socket.user.activepl){
						returnObj.data = {
							error: 'CannotJoinQueueWithoutPlaylist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var pl = socket.user.playlistCache[ socket.user.activepl ];

					if (pl.data.content.length == 0){
						returnObj.data = {
							error: 'CannotJoinQueueWithEmptyPlaylist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if(that.room.queue.add(socket)){
						returnObj.data = { success: true };
						socket.sendJSON(returnObj);
					} else {
						returnObj.data = {
							error: 'CannotJoinInQueue'
						};
						socket.sendJSON(returnObj);
					}

					break;

				case 'djQueueLeave':
					/*
					 Expects {
					 	type: 'djQueueLeave',
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.leave')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if(that.room.queue.remove(socket)){
						returnObj.data = { success: true };
						socket.sendJSON(returnObj);
					} else {
						returnObj.data = {
							error: 'CannotLeaveQueue'
						};
						socket.sendJSON(returnObj);
					}
					break;

				case 'djQueueModSkip':
					/*
					 Expects {
					 	type: 'djQueueSkip',
					 }
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.skip.other')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (that.room.queue.currentdj){
						var res = that.room.queue.modSkip(data.data.lockSkipPosition);

						returnObj.data = res;
						socket.sendJSON(returnObj);

						var broadcastData = {
							mid: socket.user.uid
						};
						if (typeof res.position === 'number' && !isNaN(res.position)){
							broadcastData.lockSkipPosition = res.position;
						}
						that.room.sendAll({
							type: 'djQueueModSkip',
							data: broadcastData
						});
					}else{
						returnObj.data = {
							error: 'nobodyIsPlaying'
						};
						socket.sendJSON(returnObj);
					}
					break;

				case 'djQueueSkip':
					/*
					 Expects {
					 	type: 'djQueueSkip',
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.skip.self')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!that.room.queue.currentdj){
						returnObj.data = {
							error: 'NobodyIsPlaying'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (socket.user.uid == that.room.queue.currentdj.user.uid){
						var res = that.room.queue.skip();

						returnObj.data = res;
						socket.sendJSON(returnObj);

						that.room.sendAll({
							type: 'djQueueSkip',
							data: {
								uid: socket.user.uid
							}
						});
					}else{
						returnObj.data = {
							error: 'djIsNotYou'
						};
						socket.sendJSON(returnObj);
					}

					break;

				case 'djQueueLock':
					/*
					 Expects {
					 	type: 'djQueueLock',
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.lock')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {success: true};
					socket.sendJSON(returnObj);

					that.room.sendAll({
						type: 'djQueueLock',
						data: {
							mid: socket.user.uid,
							state: that.room.queue.toggleLock()
						},
					});
					break;

				case 'djQueueCycle':
					/*
					 Expects {
					 	type: 'djQueueCycle',
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.cycle')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {success: true};
					socket.sendJSON(returnObj);

					that.room.sendAll({
						type: 'djQueueCycle',
						data: {
							mid: socket.user.uid,
							state: that.room.queue.toggleCycle()
						},
					});

					break;

				case 'djQueueModMove':
					/*
					Expects: {
						type: 'djQueueModMove',
						data: {
							uid: ID of user to move,
							position: position to move user to
						}
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.move')) {
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var userSock = that.room.findSocketByUid(data.data.uid);
					if (userSock == null) {
						returnObj.data = {
							error: 'UserNotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}
					if (data.data.position == undefined){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var res = that.room.queue.move(userSock, data.data.position);
					returnObj.data = {
						success: res.success
					};

					socket.sendJSON(returnObj);

					if (res.success) {
						res.data.mid = socket.user.uid;
						that.room.sendAll({
							type: 'djQueueModMove',
							data: res.data
						});
					}

					break;

				case 'djQueueModSwap':
					/*
					Expects: {
						type: 'djQueueModMove',
						data: {
							uid1: ID of user 1 to swap,
							uid2: ID of user 2 to swap
						}
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.move')) {
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var user1Sock = that.room.findSocketByUid(data.data.uid1);
					if (user1Sock == null) {
						returnObj.data = {
							error: 'UserNotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var user2Sock = that.room.findSocketByUid(data.data.uid2);
					if (user2Sock == null) {
						returnObj.data = {
							error: 'UserNotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (user1Sock.user.uid == user2Sock.user.uid){
						returnObj.data = {
							error: 'SwappingSameUser'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var res = that.room.queue.swap(user1Sock, user2Sock);
					res.data.mid = socket.user.uid;
					returnObj.data = {
						success: res.success
					};
					socket.sendJSON(returnObj);

					if (res.success) {
						that.room.sendAll({
							type: 'djQueueModSwap',
							data: res.data
						});
					}

					break;

				case 'djQueueModAdd':
					/*
					 Expects {
					 	type: 'djQueueModAdd',
					 	data: {
					 		uid: ID of the user to add
					 	}
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.move')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var userSock = that.room.findSocketByUid(data.data.uid);
					if (userSock == null) {
						returnObj.data = {
							error: 'UserNotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//TODO: Check over limit permission
					//TODO: Check lock permission
					if (!userSock.user.activepl){
						returnObj.data = {
							error: 'CannotAddToQueueWithoutPlaylist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var pl = userSock.user.playlistCache[ userSock.user.activepl ];

					if (pl.data.content.length == 0){
						returnObj.data = {
							error: 'CannotAddToQueueWithEmptyPlaylist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var res = that.room.queue.add(userSock, data.data.position);
					if(res.success){
						returnObj.data = res;
						socket.sendJSON(returnObj);

						var sendObj = {
							mid: socket.user.uid,
							uid : userSock.user.uid
						};
						if (typeof res.position != 'undefined'){
							sendObj.position = res.position;
						}
						that.room.sendAll({
							type: 'djQueueModAdd',
							data: sendObj
						});

					} else {
						returnObj.data = {
							error: 'CannotAddToQueue'
						};
						socket.sendJSON(returnObj);
					}

					break;

				case 'djQueueModRemove':
					/*
					 Expects {
					 	type: 'djQueueModRemove',
					 	data: {
					 		uid: ID of the user to add
					 	}
					 }
					*/

					if (!socket.room) {
						returnObj.data = {

							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'djqueue.move')){
						returnObj.data = {

							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var userSock = that.room.findSocketByUid(data.data.uid);
					if (userSock == null) {
						returnObj.data = {

							error: 'UserNotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if(that.room.queue.remove(userSock)){
						returnObj.data = { success: true };
						socket.sendJSON(returnObj);

						that.room.sendAll({
							type: 'djQueueModRemove',
							data: {
								mid: socket.user.uid,
								uid : userSock.user.uid
							}
						});

					} else {
						returnObj.data = {
							error: 'CannotRemoveFromQueue'
						};
						socket.sendJSON(returnObj);
					}

					break;

				case 'signup':
					/*
					 Expects {
					 	email: email string, required
					 	pw: SHA256'd password string, required
					 	un: Username, required
					 }

					 Returns {
					 	error: error string if error
					 	user: user object if successful
					 }
					*/

				case 'login':
					/*
					 Expects {
					 	email: email string, required if no token provided
					 	pw: SHA256'd password string, required if no token provided
					 	token: For repeated login, only required if email/pw is not present. Prioritised over email/pw
					 	captcha: reCaptcha key to validate
					 }

					 Returns {
					 	error: error string if error
					 	user: user object if successful

					 }
					*/

					//Check if already logged
					if (socket.user){
						returnObj.data = {

							error: 'AlreadyLoggedIn'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Create a function
					var callback = function(err, user, token){
						if (err){
							// Do stuff, report login failed
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
							return;
						}

						var userDisconnected = that.disconnectedAuthdSockets.data[user.uid];
						var inRoom;

						if (socket.room) {
							inRoom = true;
							that.room.removeUser(socket);
						} else {
							inRoom = false;
						}

						socket.user = user;
						that.unauthdSockets.remove(socket);
						that.authdSockets.add(socket);

//						if (inRoom) that.room.addUser(socket);

						if (inRoom){
							if (!userDisconnected)
								that.room.addUser(socket);
							else {
								that.room.replaceUser(userDisconnected.sock, socket);
								that.disconnectedAuthdSockets.remove(userDisconnected.socket);
							}
						}else{
							if (userDisconnected){
								that.room.replaceUser(userDisconnected.sock, socket);
								that.disconnectedAuthdSockets.remove(userDisconnected.sock);
							}
						}

						returnObj.data = {
							token: ( token ? token : null),
							room: that.room.getRoomMeta(),
						};

						var tempUser = socket.user.makeUserObj();

						if (socket.user.activepl){
							socket.user.playlistCache[ socket.user.activepl ].getExpanded(function(err, plData){
								tempUser.playlists[ socket.user.activepl ].content = YT.removeThumbs(plData);
								returnObj.data.user = tempUser,
								socket.sendJSON(returnObj);
							});
						}else{
							returnObj.data.user = tempUser,
							socket.sendJSON(returnObj);
						}

//						returnObj.data.vote = that.room.queue.getUserVote( socket );
					};

					//Validate captcha if registering
					if(data.type == 'login'){
							DB.loginUser(data.data, callback);
					} else {
						if(config.room.recaptcha){
							request.post(
								'https://www.google.com/recaptcha/api/siteverify',
								{
									form: {
										secret: config.apis.reCaptcha.secret,
										response: data.data.captcha,
										remoteip: socket.upgradeReq.connection.remoteAddress,
									}
								},
								function (error, response, body) {
									if (!error && response.statusCode == 200) {
										if(JSON.parse(body).success) {
											DB.createUser(data.data, callback);
											return;
										}
									}
									returnObj.data = {
										error: 'InvalidCaptcha',
									};
									socket.sendJSON(returnObj);
									return;
								}
							);
						} else {
							DB.createUser(data.data, callback);
						}
					}

					break;
				case 'chat':
					/*
				    Expected input object:
					{
						type: 'chat',
						data: {
							message: 'message'
						}
					}
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'chat.send')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!data.data.message || data.data.message == '' || typeof data.data.message != 'string') {
						returnObj.data = {
							error: 'EmptyMessage'
						};
						socket.sendJSON(returnObj);
						break;
					}

					that.room.sendMessage(socket, data.data.message, null, null, function(cid){
						returnObj.data = {
							success: true,
							cid: cid,
						};

						socket.sendJSON(returnObj);
						ModuleManager.DispatchEvent('ROOM.CHAT', data.data);
					});
					break;
				case 'staffchat':
					/*
				    Expected input object:
					{
						type: 'staffchat',
						data: {
							message: 'message'
						}
					}
					*/
					//Check for room login
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Check for permission
					if (!Roles.checkPermission(socket.user.role, 'chat.staff')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!data.data.message || data.data.message == '' || typeof data.data.message != 'string') {
						returnObj.data = {
							error: 'EmptyMessage'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {
						success: true
					};
					socket.sendJSON(returnObj);

					//Send message
					that.room.sendMessage(socket, data.data.message, function(obj){ return (obj.room && obj.user && Roles.checkPermission(obj.user.role, 'chat.staff')); }, 'staffchat');
					break;
				case 'privateMessage':
					/*
				    Expected input object:
					{
						type: 'privateMessage',
						data: {
							uid: uid,
							message: 'message'
						}
					}
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'chat.private')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					if (typeof data.data.message != 'string' || !data.data.message){
						returnObj.data = {
							error: 'emptyMessage'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var msg = data.data.message.substring(0,255);

					returnObj.data = {
						success: true,
						message: msg,
						uid: data.data.uid
					};
					socket.sendJSON(returnObj);

					var userSock = that.room.findSocketByUid(data.data.uid);
					if (userSock != null) {
						userSock.sendJSON({
							type: 'privateMessage',
							data: {
								uid: socket.user.uid,
								message: msg
							}
						});
					}
					DB.logPM(socket.user.uid, data.data.uid, msg);
					break;

				case 'getConversations':
					/*
				    Expected input object:
					{
						type: 'getConversations',
						data: {
						}
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'chat.private')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					DB.getConversations(socket.user.uid, function(err, res) {
						if (err) {

						} else {
							for (var i in res) {
								if (res[i].user && res[i].user.uid > 0){
									res[i].user.role = that.room.findRole(res[i].user.uid);
								}
							}
							returnObj.data = {
								conversations: res
							};
							socket.sendJSON(returnObj);
						}
					});
					break;

				case 'getPrivateConversation':
					/*
				    Expected input object:
					{
						type: 'getPrivateConversation',
						data: {
							uid: uid
						}
					}
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'chat.private')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!data.data.uid) {
						break;
					}
					DB.getUserByUid(data.data.uid, function(err, user) {
						if (err) {
							returnObj.data = {
								error: 'UserNotFound'
							};
							socket.sendJSON(returnObj);
							return;
						}
						DB.getConversation(socket.user.uid, data.data.uid, function(err, res) {
							if (err) {
								returnObj.data = {
									error: 'FailedRetrievingPMs'
								};
								socket.sendJSON(returnObj);
								return;
							}

							returnObj.data = {
								user: user.getClientObj(),
								messages: res
							}
							socket.sendJSON(returnObj);
						});
					});
					break;

				case 'markConversationRead':
					/*
				    Expected input object:
					{
						type: 'markConversationRead',
						data: {
							uid: uid,
							date: date
						}
					}
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'chat.private')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					if (!data.data.uid || ! data.data.date) {
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}
					DB.markConversationRead(socket.user.uid, data.data.uid, new Date(data.data.date));
					break;

				case 'broadcastMessage':
					if (!Roles.checkPermission(socket.user.role, 'chat.broadcast')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!data.data.message || typeof data.data.message != 'string'){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					that.room.sendBroadcastMessage(
						data.data.message.replace('<', '&lt;').replace('>', '&gt;')
					);
					break;

				case 'youtubeSearch':
					/*
					 Expects {
					 	type: 'youtubeSearch',
						data: {
							query: 'name'
						}
					 }
					*/

					if (!data.data.query || typeof data.data.query != 'string'){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var cid = YT.parseURL(data.data.query);
					var searchFunc = YT.search;
					var query = data.data.query;

					if (cid){
						searchFunc = YT.getVideo;
						query = cid;
					}

					searchFunc(query, function(err, res){
						if (err){
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
							return;
						}

						returnObj.data = {
							results: res
						};

						socket.sendJSON(returnObj);
					});

					break;

				case 'playlistCreate':
					/*
					 Expects {
					 	type: 'playlistCreate',
						data: {
							name: 'name'
						}
					 }
					*/

					if (!Roles.checkPermission(socket.user.role, 'playlist.create')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!data.data.name){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					data.data.name = data.data.name.toString();

					socket.user.addPlaylist(data.data.name, function(err, pl){
						if (err){
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
							return;
						}

						returnObj.data = {
							id: pl.id,
							playlist: pl.makeClientObj()
						};

						socket.sendJSON(returnObj);
					});

					break;
				case 'playlistRename':
					/*
					 Expects {
					 	type: 'playlistRename',
					 	data: {
					 		pid: pid,
					 		name: string,
					 	}
					 }
					*/

				case 'getPlaylistContents':
					/*
					 Expects {
					 	type: 'getPlaylistContents',
						data: {
							pid: pid
						}
					 }
					*/

				case 'playlistDelete':
					/*
					 Expects {
					 	type: 'playlistDelete',
						data: {
							pid: pid
						}
					 }
					*/

				case 'playlistActivate':
					/*
					 Expects {
					 	type: 'playlistActivate',
						data: {
							pid: pid
						}
					 }
					*/

				case 'playlistMoveSong':
					/*
					 Expects {
					 	type: 'playlistMoveSong',
						data: {
							pid: pid,
							cid: 'cid',
							index: index	This is the NEW index
						}
					 }
					*/

				case 'playlistAddSong':
					/*
					 Expects {
					 	type: 'playlistAddSong',
						data: {
							pid: pid,
							cid: 'cid'
						}
					 }
					*/

				case 'playlistRemoveSong':
					/*
					 Expects {
					 	type: 'playlistRemoveSong',
						data: {
							pid: pid,
							cid: 'cid'
						}
					 }
					*/
				case 'playlistShuffle':
					/*
					 Expects {
					 	type: 'playlistShuffle',
						data: {
							pid: pid,
						}
					 }
					*/
					if (!data.data.pid){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					data.data.pid = parseInt(data.data.pid);

					if (isNaN(data.data.pid)){
						returnObj.data = {
							error: 'PIDIsNotANumber'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (socket.user.playlists.indexOf(data.data.pid) == -1){
						returnObj.data = {
							error: 'UserDoesNotOwnPlaylist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var pl = socket.user.playlistCache[data.data.pid];

					if (!pl){
						returnObj.data = {
							error: 'PlaylistDoesNotExist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if ( data.type == 'getPlaylistContents' ){
						socket.user.playlistCache[ data.data.pid ].getExpanded(function(err, content){
							if (err){
								returnObj.data = {
									error: err
								};
								socket.sendJSON(returnObj);
								return;
							}

							content = YT.removeThumbs(content);

							returnObj.data = {
								content: content
							};
							socket.sendJSON(returnObj);
						});
					} else if (data.type == 'playlistAddSong'){
						if (!data.data.cid){
							returnObj.data = {
								error: 'PropsMissing'
							};
							socket.sendJSON(returnObj);
							break;
						}
						if (!data.data.pos){
							data.data.pos = 'top';
						}
						if (Array.isArray(data.data.cid)) {
							if (data.data.cid.length == 0) {
								returnObj.data = {
									error: 'emptyCidArray'
								};
								socket.sendJSON(returnObj);

								break;
							}
							var songsAdded = 0;
							var videos = [];

							data.data.cid.filter(function(e, i, a){
								return a.indexOf(e) != i;
							});

							for (var i = 0, len = data.data.cid.length; i < len; i++) {
								var cid = data.data.cid[i];

								if (pl.data.content.indexOf(cid) == -1) {
									pl.addSong(cid, data.data.pos, function(err, vidData, pos){
										if (!err){
											for (var i in vidData) {
												videos.push(vidData[i]);
											}
										} else {
											console.log(err);
										}

										if (++songsAdded == data.data.cid.length) {
											returnObj.data = {
												video: videos,
												pos: data.data.pos,
												plid: pl.id
											};

											socket.sendJSON(returnObj);
										}
									});
								} else {
									if (++songsAdded == data.data.cid.length) {
										returnObj.data = {
											video: videos,
											pos: data.data.pos,
											plid: pl.id
										};

										socket.sendJSON(returnObj);
									}
								}
							}
						} else {
							if (pl.data.content.indexOf(data.data.cid) > -1){
								returnObj.data = {
									error: 'SongAlreadyInPlaylist'
								};
								socket.sendJSON(returnObj);
								break;
							}

							pl.addSong(data.data.cid, data.data.pos, function(err, vidData, pos){
								if (err){
									returnObj.data = {
										error: err
									};
									socket.sendJSON(returnObj);
									return;
								}

								returnObj.data = {
									video: vidData[data.data.cid],
									pos: pos,
									plid: pl.id
								};

								socket.sendJSON(returnObj);
							});
						}
					}else if (data.type == 'playlistRemoveSong'){
						if (!data.data.cid){
							returnObj.data = {
								error: 'PropsMissing'
							};
							socket.sendJSON(returnObj);
							break;
						}

						if ( that.room.queue.isPlaying(socket) && socket.user.activepl == data.data.pid && pl.data.content.length == 1){
							returnObj.data = {
								error: 'CannotRemoveOnlySongWhileWaitlisted'
							};
							socket.sendJSON(returnObj);
							break;
						}

						pl.removeSong(data.data.cid, function(err, pl){
							if (err){
								returnObj.data = {
									error: err
								};
								socket.sendJSON(returnObj);
								return;
							}

							returnObj.data = {success: true};
							socket.sendJSON(returnObj);
						});
					}else if (data.type == 'playlistMoveSong'){
						if (!data.data.cid || typeof data.data.index === 'undefined'){
							returnObj.data = {
								error: 'PropsMissing'
							};
							socket.sendJSON(returnObj);
							break;
						}

						pl.moveSong(data.data.cid, data.data.index, function(err, pl){
							if (err){
								returnObj.data = {
									error: err
								};
								socket.sendJSON(returnObj);
								return;
							}

							returnObj.data = {success: true};

							socket.sendJSON(returnObj);
						});

					}else if (data.type == 'playlistDelete'){
						if (!Roles.checkPermission(socket.user.role, 'playlist.delete')){
							returnObj.data = {
								error: 'InsufficientPermissions'
							};
							socket.sendJSON(returnObj);
							break;
						}

						if ( that.room.queue.isPlaying(socket) && socket.user.activepl == data.data.pid){
							returnObj.data = {
								error: 'CannotRemoveActivePlaylistWhileWaitlisted'
							};
							socket.sendJSON(returnObj);
							break;
						}

						if ( that.room.queue.isPlaying(socket) && socket.user.playlists.length == 1 ){
							returnObj.data = {
								error: 'CannotRemoveOnlyPlaylistWhileWaitlisted'
							};
							socket.sendJSON(returnObj);
							break;
						}

						socket.user.removePlaylist(data.data.pid, function(err, id, activepl){
							if (err){
								returnObj.data = {error: err};
								socket.sendJSON(returnObj);
								return;
							}

							returnObj.data = {
								id: id,
								active: activepl
							};

							socket.sendJSON(returnObj);
						});
					}else if (data.type == 'playlistActivate'){
						if ( that.room.queue.isPlaying(socket) && pl.data.content.length == 0){
							returnObj.data = {
								error: 'CannotActivateEmptyPlaylistWhileWaitlisted'
							};
							socket.sendJSON(returnObj);
							break;
						}

						socket.user.activepl = data.data.pid;

						returnObj.data = {
							active: socket.user.activepl
						};

						socket.sendJSON(returnObj);
					} else if (data.type == 'playlistShuffle'){

						//Check permission
						if (!Roles.checkPermission(socket.user.role, 'playlist.shuffle')){
							returnObj.data = {
								error: 'InsufficientPermissions'
							};
							socket.sendJSON(returnObj);
							break;
						}

						//Check playlist length
						var l = pl.data.content.length;
						if (l < 2){
							returnObj.data = {
								error: 'ShuffleRequiresTwoElementsOrMore'
							};
							socket.sendJSON(returnObj);
							break;
						} else {
							//Shuffle playlist
							var i, t;
							while (l) {
								i = Math.floor(Math.random() * l--);
								t = pl.data.content[l];
								pl.data.content[l] = pl.data.content[i];
								pl.data.content[i] = t;
							}
							pl.save();
							socket.user.playlistCache[data.data.pid] = pl;
							pl.getExpanded(function(err, plData){
								returnObj.data = {
									content: plData,
								};
								socket.sendJSON(returnObj);
							});
						}
					}else if (data.type == 'playlistRename'){
						if (!data.data.name){
							returnObj.data = {
								error: 'PropsMissing'
							};
							socket.sendJSON(returnObj);
							break;
						}

						pl.name = data.data.name.toString();

						returnObj.data = {
							success: true,
							name: pl.name
						};
						socket.sendJSON(returnObj);
					}



					break;
				case 'djQueueLimit':
					/*
					 Expects {
					 	type: 'djQueueLimit',
					 	data: {
					 		limit: limit
					 	}
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'playlist.limit')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if(that.room.queue.setLimit(data.data.limit)){
						returnObj.data = { success: true };
						socket.sendJSON(returnObj);

						that.room.sendAll({
							type: 'djQueueLimit',
							data: {
								mid: socket.user.uid,
								limit : data.data.limit
							}
						});
					} else {
						returnObj.data = {
							error: 'InvalidLimit'
						};
						socket.sendJSON(returnObj);
					}
					break;
				case 'vote':
					/*
					 Expects {
					 	type: 'vote',
					 	data: {
					 		voteType: voteType
					 	}
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (typeof data.data.voteType != 'string') {
						returnObj.data = {
							error: 'InvalidVoteType'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var res = that.room.queue.vote(data.data.voteType, socket);

//					if (res){
						returnObj.data = {
							success: res
						};
						socket.sendJSON(returnObj);
/*					}else{
						returnObj.data = {
							error: 'InvalidVote'
						};
						socket.sendJSON(returnObj);
					}
*/
					break;
				case 'toggleLastDj':
					/*
					 Expects {
					 	type: 'toggleLastDj'
					 }
					*/
					//Check if user is in queue
					if(!that.room.queue.isPlaying(socket)){
						returnObj.data = {
							error: 'NotInQueue',
						};
					} else {
						socket.user.lastdj = !socket.user.lastdj;
						returnObj.data = {
							newval: socket.user.lastdj,
						};
					}
					socket.sendJSON(returnObj);
					break;
				case 'badgeUpdate':
					/*
					 Expects {
					 	type: 'badgeUpdate',
					 	data: {
					 		badge: {top: hex, bottom: hex}
					 	}
					 }
					*/

					var colorValidator = /^#([0-9a-f]{6}|[0-9a-f]{3})$/gi;

					if (!data.data.badge || !data.data.badge.top || !data.data.badge.bottom ||
						data.data.badge.top.search(colorValidator) == -1 || data.data.badge.bottom.search(colorValidator) == -1 ){

						returnObj.data = {
							error: 'InvalidBadgeObject'
						};
						socket.sendJSON(returnObj);
						break;
					}

					socket.user.badge = {top: data.data.badge.top, bottom: data.data.badge.bottom};

					if (socket.room){
						that.room.sendUserUpdate(socket.user);
					}

					returnObj.data = {
						success: true
					};

					socket.sendJSON(returnObj);

					break;
				case 'findChannels':
					/*
					 Expects {
					 	type: 'findChannels',
					 	data: {
					 		query: string,
					 		pageToken: null or string,
					 	}
					 }
					*/
					if (typeof data.data.query != 'string') {
						returnObj.data = {
							error: 'InvalidQueryType'
						};
						socket.sendJSON(returnObj);
						break;
					}

					YT.findChannels({
						query: data.data.query,
						pageToken: data.data.pageToken,
					}, function(err, data){
						if(err)
							returnObj.data = {
								error: err,
							};
						else
							returnObj.data = data;

						socket.sendJSON(returnObj);
					});
					break;
				case 'findPlaylists':
					/*
					 Expects {
					 	type: 'findPlaylists',
					 	data: {
					 		query: string,
					 		pageToken: null or string,
					 	}
					 }
					*/

					if (typeof data.data.query != 'string') {
						returnObj.data = {
							error: 'InvalidQueryType'
						};
						socket.sendJSON(returnObj);
						break;
					}

					YT.findPlaylists({
						query: data.data.query,
						pageToken: data.data.pageToken,
					}, function(err, data){
						if(err)
							returnObj.data = {
								error: err,
							};
						else
							returnObj.data = data;

						socket.sendJSON(returnObj);
					});
					break;
				case 'getChannelPlaylists':
					/*
					 Expects {
					 	type: 'getChannelPlaylists',
					 	data: {
					 		channelId: string,
					 		pageToken: null or string,
					 	}
					 }
					*/

					YT.getChannelPlaylists({
						channelId: data.data.channelId.toString(),
						pageToken: data.data.pageToken,
					}, function(err, data){
						if(err)
							returnObj.data = {
								error: err,
							};
						else
							returnObj.data = data;

						socket.sendJSON(returnObj);
					});
					break;
				case 'getPlaylist':
					/*
					 Expects {
					 	type: 'getPlaylist',
					 	data: {
					 		playlistId: string,
					 		pageToken: null or string,
					 	}
					 }
					*/

					YT.getPlaylist({
						playlistId: data.data.playlistId.toString(),
						pageToken: data.data.pageToken,
					}, function(err, data){
						if(err)
							returnObj.data = {
								error: err,
							};
						else
							returnObj.data = data;

						socket.sendJSON(returnObj);
					});
					break;
				case 'importPlaylist':
					/*
					 Expects {
					 	type: 'importPlaylist',
					 	data: {
					 		playlistId: string,
					 		expanded: bool,
					 	}
					 }
					*/
					//Check for permissions
					if (!Roles.checkPermission(socket.user.role, 'playlist.import')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Check for required parameters
					if (!data.data.playlistId || (typeof data.data.expanded) != 'boolean'){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Get playlist
					YT.getPlaylistFull({
						playlistId: data.data.playlistId.toString(),
						pageToken: data.data.pageToken,
					}, function(err, videos){
						//Handle error
						if(err){
							returnObj.data = {
								error: err,
							};
							socket.sendJSON(returnObj);
							return;
						}

						//Playlist creation and import
						YT.getPlaylistName(data.data.playlistId.toString(), function(err, plname){

							//Prepare for multiple playlists if necessary, split by 200
							var returnPlaylists = [];
							videos.videos = Array.from(Array(Math.ceil(videos.videos.length / 200)), function(_,i) {
								return videos.videos.slice(i * 200, i * 200 + 200);
							});
							var toAdd = videos.videos.length;

							//Create playlist(s)
							videos.videos.forEach(function(e, i) {
								socket.user.addPlaylist(plname + " #" + (i + 1), function(err, pl){
									//Handle error
									if (err){
										returnObj.data = {
											error: err
										};
										socket.sendJSON(returnObj);
										return;
									}

									//Add all songs
									if (e == undefined || e == null) {
										return;
									}
									var toAddInPl = e.length;
									e.forEach(function(ee, ii) {
									    pl.data.content.push(ee);
								    	if(!(--toAddInPl)) {
								    		pl.save();
						    				returnObj.data = returnObj.data || { content: [], };

						    				if(data.data.expanded){
						    					//Expanded
								    			pl.getExpanded(function(err, plData){
													returnObj.data.content.push({
														content: plData,
														id: pl.id,
														name: pl.data.name,
													});
													if(!(--toAdd)) {
														socket.sendJSON(returnObj);
													}
												});
						    				} else {
												//Non expanded
												returnObj.data.content.push({
													id: pl.id,
													name: pl.data.name,
													num: pl.data.content.length,
												});
												if(!(--toAdd)) {
													socket.sendJSON(returnObj);
												}
						    				}
								    	}
									});
								});
							});
						});
					});
					break;
				case 'setRole':
					/*
					 Expects {
					 	type: 'getPlaylist',
					 	data: {
					 		uid: uid,
					 		role: string
					 	}
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Check for permissions
					if (!Roles.checkPermission(socket.user.role, 'room.grantroles')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Check for required parameters
					if (!data.data.uid || !data.data.role){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					data.data.role = data.data.role.toLowerCase();

					//Check for role existence
					if (!Roles.roleExists(data.data.role)){
						returnObj.data = {
							error: 'RoleDoesNotExist'
						};
						socket.sendJSON(returnObj);
						break;
					}

					DB.getUserByUid(data.data.uid, function(err, user){
						if (err){
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
							return;
						}

						user.role = that.room.findRole(user.uid);

						//Check if user can grant this role and take the target's role
						if (!Roles.checkCanGrant(socket.user.role, [user.role, data.data.role])){
							returnObj.data = {
								error: 'InsufficientPermissions'
							};
							socket.sendJSON(returnObj);
							return;
						}

						//Execute and return data
						returnObj.data = {
							success: that.room.setRole(user, data.data.role)
						};
						socket.sendJSON(returnObj);

						that.room.sendAll({
							type: 'moderateSetRole',
							data: {
								mid: socket.user.uid,
								uid : user.uid,
								role: data.data.role
							}
						});
					});

					break;

				case 'deleteChat':
					/*
					 Expects {
					 	type: 'deleteChat',
					 	data: {
					 		cid: cid,
					 		mid : socket.user.uid
					 	}
					 }
					*/

					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}

					if (!Roles.checkPermission(socket.user.role, 'chat.delete')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var cid = parseInt(data.data.cid);

					if (isNaN(cid) || cid < 1){
						returnObj.data = {
							error: 'InvalidCid'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {
						success: true
					};
					socket.sendJSON(returnObj);

					that.room.deleteChat(cid, socket.user.uid);
					break;

				case 'banUser':
					/*
					 Expects {
					 	type: 'banUser',
					 	data: {
					 		uid: uid,
					 		duration: ISO 8601 duration,
					 		reason: ''
					 	}
					 }
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}
					if (!Roles.checkPermission(socket.user.role, 'room.banUser')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var uid = parseInt(data.data.uid);
					if (isNaN(uid)){
						returnObj.data = {
							error: 'InvalidUid'
						};
						socket.sendJSON(returnObj);
						break;
					}

					var banObj = {
						uid: uid,
						end: null,
						start: Date.now(),
						reason: data.data.reason || 'No reason specified',
						bannedBy: {
							uid: socket.user.uid,
							role: socket.user.role
						}
					};

					try{
						banObj.end = (Date.now() + (new Duration(data.data.duration.toString().toUpperCase())).inSeconds() * 1000);
					} catch(e) {
						returnObj.data = {
							error: 'InvalidBanType',
							text: e.message,
						};
						socket.sendJSON(returnObj);
						break;
					}

					that.room.banUser(banObj, function(err){
						if (err) {
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
						}
						else {
							// Success
							returnObj.data = {
								success: true
							};
							socket.sendJSON(returnObj);
						}
					});
					break;
				case 'unbanUser':
					/*
					 Expects {
					 	type: 'unbanUser',
					 	data: {
					 		uid: uid
					 	}
					 }
					*/
					if (!socket.room) {
						returnObj.data = {
							error: 'NotInPad'
						};
						socket.sendJSON(returnObj);
						break;
					}
					if (!Roles.checkPermission(socket.user.role, 'room.banUser')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}
					var uid = parseInt(data.data.uid);
					if (isNaN(uid)){
						returnObj.data = {
							error: 'InvalidUid'
						};
						socket.sendJSON(returnObj);
						break;
					}

					returnObj.data = {
						success: that.room.unbanUser(uid, socket)
					};
					socket.sendJSON(returnObj);

					break;
				case 'getUser':
					/*
					 Expects {
					 	type: 'getUser',
					 	data: {
					 		uid: uid
					 	}
					 }
					*/
					if (isNaN(data.data.uid)){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					DB.getUserByUid(data.data.uid, { getPlaylists: false }, function(err, user){
						//Handle error
						if (err){
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
							return;
						}

						//Execute and return data
						returnObj.data = {
							user: user.getClientObj(),
						};
						socket.sendJSON(returnObj);
					});
					break;
				case 'getUserByName':
					/*
					 Expects {
					 	type: 'getUserByName',
					 	data: {
					 		un: un
					 	}
					 }
					*/
					if (!data.data.un){
						returnObj.data = {
							error: 'PropsMissing'
						};
						socket.sendJSON(returnObj);
						break;
					}

					DB.getUserByName(data.data.un, { getPlaylists: false }, function(err, user){
						//Handle error
						if (err){
							returnObj.data = {
								error: err
							};
							socket.sendJSON(returnObj);
							return;
						}

						//Execute and return data
						returnObj.data = {
							user: user.getClientObj(),
						};
						returnObj.data.user.role = that.room.findRole(returnObj.data.user.uid);
						socket.sendJSON(returnObj);
					});
					break;
                case 'whois':
					/*
					 Expects {
					 	type: 'whois',
					 	data: {
					 		uid: uid,
					 		un: un
					 	}
					 }
					*/
					//Check for props
					if (!data.data.uid == !data.data.un){
						returnObj.data = {
							error: 'WrongProps'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Check for permission
					if (!Roles.checkPermission(socket.user.role, 'room.whois')){
						returnObj.data = {
							error: 'InsufficientPermissions'
						};
						socket.sendJSON(returnObj);
						break;
					}

					//Callback function
					var cb = function(err, user){

							//Handle error
							if (err){
								returnObj.data = {
									error: err
								};
								socket.sendJSON(returnObj);
								return;
							}

							//Execute and return data
							returnObj.data = {
								user: extend(user.getClientObj(), {
									uptime: user.uptime,
									created: user.created,
									playlists: user.playlists.length,
									ip: (function(){
											var users = that.room.getAttendees();

											for(var i in users)
												if(users[i].user && (data.data.un ? users[i].user.un : users[i].user.uid) == (data.data.un || data.data.uid))
													return users[i].upgradeReq.headers['x-forwarded-for'] || users[i].upgradeReq.connection.remoteAddress;

											return null;
										})(),
								}),
							};
            				returnObj.data.user.online = !!returnObj.data.user.ip;
            				returnObj.data.user.role = that.room.findRole(returnObj.data.user.uid);
							socket.sendJSON(returnObj);
						};

					if(data.data.un)
						DB.getUserByName(data.data.un, { getPlaylists: false }, cb);
					else
						DB.getUserByUid(data.data.uid, { getPlaylists: false }, cb);
					break;
			}
		});
	});
};

SocketServer.prototype.removeSock = function(sock){
//	if ( sock.room )  this.room.removeUser(sock);

	if ( !sock.user ){
		this.unauthdSockets.remove(sock);
		if ( sock.room ) this.room.removeUser(sock);
		return;
	}else{
		this.disconnectedAuthdSockets.add(sock);
	}

	this.authdSockets.remove(sock);
};

SocketServer.prototype.gracefulExit = function() {
	if (this.room) {
		this.room.updateLobbyServer(null, null, function() {
			process.exit();
		});
	}
	setTimeout(function() {
		process.exit();
	}, 2000);
};

module.exports = SocketServer;
