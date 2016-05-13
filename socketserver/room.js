var extend = require('extend');
var ws = require('ws');
var https = require('https');
var http = require('http');
var log = new (require('basic-logger'))({showTimestamp: true, prefix: "Room"});
var DJQueue = require('./djqueue.js');
var Roles = require('./role');
var config = require('../serverconfig');
var DB = require('./database');

var defaultDBObj = function(){
	return {
		roles: {},
		bans: {}, // Uses UID as key, object containing reason and end time as value.
		history: []
	};
};


var Room = function(socketServer, options){
	var that = this;

	this.roomInfo = extend(true, {
		name: "",  				             // Room name
		slug: "",  				             // Room name shorthand (no spaces, alphanumeric with dashes)
		greet: "", 				             // Room greetings
		maxCon: 0,			               	 // Max connections; 0 = unlimited
		ownerEmail: "",                      // Owner email for owner promotion
		guestCanSeeChat: true, 	             // Whether guests can see the chat or not
		bannedCanSeeChat: true,	             // Whether banned users can see the chat
		roomOwnerUN: null,		             // Username of the room owner to use with lobby API
	}, options);

	this.socketServer = socketServer;
	this.queue = new DJQueue( this );
	this.attendeeList = [];
	this.data = new defaultDBObj();
	this.apiUpdateTimeout = null;
	this.lastChat = [];
	this.createApiTimeout();

	DB.getRoom(this.roomInfo.slug, function(err, data){
		// Just in case the slug doesn't exist yet
		data = data || {};

		// If the slug doesn't exist, make owner will make the slug
		if (err && !err.notFound){console.log(err); return;}

		extend(true, that.data, data);

		that.makeOwner();
	});
};

Room.prototype.getRoomMeta = function(){
	return {
		name: this.roomInfo.name,
		slug: this.roomInfo.slug,
		greet: this.roomInfo.greet,
		bg: this.roomInfo.bg,
		guestCanSeeChat: this.roomInfo.guestCanSeeChat,
		bannedCanSeeChat: this.roomInfo.bannedCanSeeChat,
		roomOwnerUN: this.roomInfo.roomOwnerUN
	};
};

Room.prototype.makeOwner = function(){
	if (!config.room.ownerEmail) return;

	var that = this;

	DB.getUser(this.roomInfo.ownerEmail, function(err, data){
		if (err == 'UserNotFound') { console.log('Owner does not exist yet.'); that.data.roles.owner = []; return; }
		if (err) { console.log('Cannot make Room Owner: ' + err); return; }

		if (typeof data.uid !== 'number') { console.log('Cannot make room owner: UserUIDError'); return; }

		log.info('Granting ' + data.un + ' (' + data.uid + ') Owner permissions');

		// Remove user from other roles to avoid interesting bugs
		for (var i in that.data.roles){
			var ind = that.data.roles[i].indexOf(data.uid);
			if ( ind > -1 ) that.data.roles[i].splice(ind, 1);
		}

		// Only one owner, set entire array to one UID and set owner username for API
		that.data.roles.owner = [ data.uid ];
		that.data.roomOwnerUN = data.un;
		that.roomInfo.roomOwnerUN = data.un;
		data.role = that.findRole(data.uid);
		data.banned = that.isUserBanned(data.uid);
		that.sendUserUpdate(data);
		that.save();
	});
};

Room.prototype.addUser = function( sock ){
	this.attendeeList.push( sock );
	var userSend = null;
	var numGuests = 0;
	sock.room = this.roomInfo.slug;

	if (sock.user){
		this.checkMakeOwner();
		sock.user.data.role = this.findRole(sock.user.data.uid);
		sock.user.data.banned = this.isUserBanned(sock.user.data.uid);
		userSend = sock.user.getClientObj();

		for (var i = 0; i < this.attendeeList.length; i++){
			var sockObj = this.attendeeList[i];

			if (!sockObj.user){
				numGuests++;
				continue;
			}

			if (sockObj == sock) continue;

			if (sockObj.user && sock.user && sockObj.user.data.uid == sock.user.data.uid){
				this.removeUser(sockObj);
				sockObj.close(1000, JSON.stringify({
					type: 'ConnectedElsewhere'
				}));
			}
		}
	}else{
		for (var i = 0; i < this.attendeeList.length; i++){
			var sockObj = this.attendeeList[i];

			if (!sockObj.user){
				numGuests++;
			}
		}
	}

	//TODO: Find and add role key to user object from room db

	this.sendAll({
		type: 'userJoined',
		data: {
			user: userSend,
			guests: numGuests
		}
	},
	function(sockObj){
		return sockObj != sock;
	});

};

Room.prototype.replaceUser = function( sock_old, sock_new ){
	if (!sock_old || !sock_old.user || !sock_new || !sock_new.user || sock_old.user.data.uid != sock_new.user.data.uid)	return false;
	var ind = this.attendeeList.indexOf(sock_old);
	this.checkMakeOwner();

	if (ind == -1 )	return false;

	sock_new.room = this.roomInfo.slug;

	sock_new.user.data.role = this.findRole(sock_old.user.data.uid);
	sock_new.user.data.banned = this.isUserBanned(sock_old.user.data.uid);

	this.attendeeList[ind] = sock_new;

	this.queue.replaceSocket(sock_old, sock_new);

	return true;
};

Room.prototype.removeUser = function( sock ){
	var that = this;
	var ind = this.attendeeList.indexOf(sock);

	if (ind > -1) {
		sock.room = null;

		var userSend = null;

		this.queue.remove( sock );

		if (sock.user) {
			userSend = sock.user.getClientObj();
			sock.user.data.role = null;
			sock.user.data.banned = null;
		}

		this.attendeeList.splice( ind, 1 );

		this.sendAll({
			type: 'userLeft',
			data: {
				user: userSend,
				guests: (function(){
					var num = 0;
					for (var i = 0; i < that.attendeeList.length; i++){
						if (!that.attendeeList[i].user) num++;
					}
					return num;
				})()
			}
		});
	}
};

Room.prototype.banUser = function(banObj, callback){
	/*
	 Expects {
	 	banObj: {
	 		uid: uid,
	 		end: int,
	 		start: int,
	 		reason: '',
	 		bannedBy: {
				uid: uid,
				role: role
			}
	 	}
	 }
	*/
	var that = this;
	DB.getUserByUid(banObj.uid, function(err, user) {
		if (err) {
			if (callback) callback(err);
			return;
		}

		if (that.isUserBanned(banObj.uid)){
			if (callback) callback('UserAlreadyBanned');
			return;
		}

		user.role = that.findRole(user.uid);

		if (!Roles.checkCanGrant(banObj.bannedBy.role, [user.role])) {
			if (callback) callback('UserCannotBeBanned');
			return;
		}

		banObj.reason = banObj.reason.substr(0, 50);

		that.data.bans[banObj.uid] = banObj;
		that.save();

		that.sendAll({
			type: 'userBanned',
			data: {
				uid: banObj.uid,
				bannedBy: banObj.bannedBy.uid
			}
		});

		var userSock = that.findSocketByUid(banObj.uid);

		//Check if user is online
		if (userSock){
			that.removeUser(userSock);
			userSock.close(1000, JSON.stringify({
				type: 'banned',
				data: {
					banEnd: banObj.end,
					reason: banObj.reason
				}
			}));
		}

		if (callback) callback(null);
	});
};

Room.prototype.unbanUser = function(uid, sock){
	if (this.data.bans[uid]){
		delete this.data.bans[uid];
		this.save();

		this.sendAll({
			type: 'userUnbanned',
			data: {
				uid: uid,
				unbannedBy: (sock ? sock.user.data.uid : null)
			}
		});

		var userSock = this.findSocketByUid(uid);

		//Check if user is online
		if (userSock){
			userSock.sendJSON({type:'unbanned'});
		}

		return true;
	}
	return false;
};

Room.prototype.isUserBanned = function(uid){
	if (this.data.bans[uid]) {
		if (this.data.bans[uid].end < new Date(Date.now())) {
			this.unbanUser(uid);
			return false;
		}
		else {
			return true;
		}
	}
	return false;
};

Room.prototype.setRole = function(user, role){
	if (!user) return false;

	if (!role) role = 'default';

	role = role.toLowerCase();

	if (Roles.roleExists(role)){
		if (typeof this.data.roles[role] === 'undefined') this.data.roles[role] = [];

		var userSock = this.findSocketByUid(user.uid);
		var isBanned = this.isUserBanned(user.uid);

		// Remove user from other role
		this.removeRole(user);

		if (role != 'default')
			this.data.roles[role].push(user.uid);

		user.role = role;
		user.banned = isBanned;


		// Save the changes
		this.save();

		if (userSock){
			// We can't assign this user object to the socket because it lacks playlists
			userSock.user.data.role = role;
			userSock.user.data.banned = isBanned;
		}

		this.sendUserUpdate(user);

		return true;
	}

	return false;
};

Room.prototype.removeRole = function(user){
	if (!user) return;

	for (var i in this.data.roles){
		var ind = this.data.roles[i].indexOf(user.uid);
		if ( ind > -1){
			this.data.roles[i].splice(ind, 1);
		}
	}
};

Room.prototype.findRole = function(uid){
	if (!uid) return 'default';

	for (var i in this.data.roles){
		var ind = this.data.roles[i].indexOf(uid);
		if ( ind > -1 && Roles.roleExists(i) ){
			return i;
		}
	}

	return 'default';
};

Room.prototype.findSocketByUid = function( uid ){

	for (var i in this.attendeeList){
		if (!this.attendeeList[i].user) continue;

		if (this.attendeeList[i].user.data.uid == uid) return this.attendeeList[i];
	}

	return null;
};

Room.prototype.getAttendees = function(){
	return this.attendeeList;
};

Room.prototype.getBannedUsers = function(callback){
	var banned = [];
	var rawBanned = [];
	var that = this;

	for (var i in this.data.bans){
		// This will unban appropriately when the list is viewed.
		if (this.isUserBanned(this.data.bans[i].uid))
			rawBanned.push(this.data.bans[i].uid);
	}

	if (!rawBanned.length){
		callback('NoBans');
		return;
	}

	DB.getUserByUid(rawBanned, {getPlaylists: false}, function (err, users) {
		for (var j in users){
			var usr = users[j].getClientObj();
			usr.role = that.findRole(usr.uid);
			usr.banned = that.isUserBanned(usr.uid);
			banned.push(usr);
		}

		callback(err, banned);
	});
};

Room.prototype.getRoomStaff = function(callback){
	var staff = [];
	var rawStaff = [];
	var that = this;

	for (var i in this.data.roles){
		if (Roles.getStaffRoles().indexOf(i) > -1) {
			rawStaff = rawStaff.concat(this.data.roles[i]);
		}
	}

	if (!rawStaff.length){
		callback('NoStaff');
		return;
	}

	DB.getUserByUid(rawStaff, { getPlaylists: false }, function (err, users) {
		for (var j in users){
			var usr = users[j].getClientObj();
			usr.role = that.findRole(usr.uid);
			usr.banned = that.isUserBanned(usr.uid);
			staff.push(usr);
		}

		callback(err, staff);
	});
};

Room.prototype.sendSystemMessage = function(message) {
	this.sendAll({type:'systemMessage', data:message});
};

Room.prototype.sendBroadcastMessage = function(message) {
	this.sendAll({type:'broadcastMessage', data:message});
};

Room.prototype.sendMessage = function( sock, message, ext, specdata, callback ){
	var that = this;

	message = message.substring(0,255).replace(/</g, '&lt;').replace(/>/g, '&gt;');

	callback = callback || function(){};

	DB.logChat(sock.user.uid, message, specdata, function(err, cid){
		that.sendAll({
			type: 'chat',
			data: {
				uid: sock.user.uid, // Will always be present. Unauthd can't send messages
				message: message,
				time: Date.now(),
				cid: cid,
				special: specdata
			}
		}, function(obj){
			// Guests can't see chat with config variable set
			if (!that.roomInfo.guestCanSeeChat && !obj.user) return false;

			// Banned users can't see chat with config variable set
			if (!that.roomInfo.bannedCanSeeChat && obj.user && that.isUserBanned(obj.user.uid)) return false;

			// Check for extensive function
			if("function" === typeof ext) if(!ext(obj)) return false;

			return true;
		});

		//Save last X messages to show newly connected users
		if(!specdata){
			that.lastChat.push({
				user: sock.user.getClientObj(),
				message: message,
				time: Date.now(),
				cid: cid,
			});
			if(that.lastChat.length > config.room.lastmsglimit) that.lastChat.shift();
		}

		callback(cid);
	});
};

Room.prototype.makePrevChatObj = function(){
	var uids = [];
	var temp = extend(true, [], this.lastChat);

	for (var i = 0; i < temp.length; i++){
		var ind = uids.indexOf(temp[i].user.uid);
		if ( ind == -1 ){
			uids.push( temp[i].user.uid );
			continue;
		}

		temp[i].user = { uid: temp[i].user.uid };
	}

	return temp;
};

Room.prototype.deleteChat = function(cid, uid){
	for (var i = 0; i < this.lastChat.length; i++){
		if (this.lastChat[i].cid == cid){
			this.lastChat.splice(i, 1);
			break;
		}
	}

	this.sendAll({
		type: 'deleteChat',
		data: {
			cid: cid,
			mid : uid
		}
	});
};

Room.prototype.sendAll = function (message, condition){
	condition = condition || function(){return true;};
	for (var i in this.attendeeList){
		var obj = this.attendeeList[i];

		if (obj.readyState != ws.OPEN || !condition(obj)) continue;

		obj.sendJSON(message);
	}
};

Room.prototype.sendUserUpdate = function(user){
	if (!user) return;

	this.sendAll({
		type: 'userUpdate',
		data: {
			user: user.getClientObj()
		}
	});
};

Room.prototype.getUsersObj = function(){
	var temp = {
		guests:  0,
		users: {}
	};
	var guestCounter = 0;

	for (var i = 0; i < this.attendeeList.length; i++){
		var obj = this.attendeeList[i];
		if (!obj.user){
			temp.guests++;
			continue;
		}

		temp.users[ obj.user.uid ] = obj.user.getClientObj();
	}

	return temp;
};

Room.prototype.getHistoryObj = function() {
	return this.data.history.slice(-config.room.history.limit_send).reverse();
};

Room.prototype.addToHistory = function(historyObj) {
	//Limit history
	if(config.room.history.limit_save !== 0)
		while(this.data.history.length >= config.room.history.limit_save) {
			this.data.history.shift();
		}

	//Add to history and save
	this.data.history.push(historyObj);
	this.save();
};

Room.prototype.updateLobbyServer = function(song, dj, callback) {
	if (!config.apis.musiqpad.sendLobbyStats) {
		if (callback) callback();
		return;
	}
	else if (!config.apis.musiqpad.key || config.apis.musiqpad.key == "") {
		throw "A musiqpad key must be defined in the config for updating the lobby server.";
		return;
	}
	var postData = {
		song: song,
		dj: dj,
		room: this.getRoomMeta(),
		userCount: this.attendeeList.length
	};
	var postOptions = {
		host: 'api.musiqpad.com',
      	port: '443',
      	path: '/pad/' + this.roomInfo.slug,
      	method: 'POST',
      	headers: {
          	'Content-Type': 'application/json',
          	'apikey': config.apis.musiqpad.key
      	}
	};
	try {
		var postReq = https.request(postOptions, function (response) {
	    	if (response.statusCode < 200 || response.statusCode > 299) {
	        	console.log('Request Failed with Status Code: ' + response.statusCode);
	    	}
	    	if (callback) callback();
		});
		postReq.write(JSON.stringify(postData));
		postReq.on('error', function() {
			postReq.end();
			console.log('Lobby Update errored.');
		});
		postReq.setTimeout(3000, function() {
			console.log('Lobby Update timed out.');
			postReq.abort();
		});
		postReq.end();
	}
	catch (e) {

	}

	this.createApiTimeout();
};

Room.prototype.createApiTimeout = function() {
	var that = this;
	clearTimeout(this.apiUpdateTimeout);

	this.apiUpdateTimeout = setTimeout(function() {
		if (that.queue.currentsong && that.queue.currentdj) {
			that.updateLobbyServer(that.queue.currentsong, that.queue.currentdj ? that.queue.currentdj.user.getClientObj() : null);
		}
		else {
			that.updateLobbyServer(null, null);
		}
	}, 300000);
	return this.apiUpdateTimeout;
};

Room.prototype.sockIsJoined = function(sock){
	if (this.attendeeList.indexOf(sock) > -1)
		return true;
	return false;
};

Room.prototype.makeDbObject = function(){
	return this.data;
};

Room.prototype.save = function(){
	DB.setRoom(this.roomInfo.slug, this.makeDbObject());
};

Room.prototype.checkMakeOwner = function() {
	if (this.data.roles.owner && this.data.roles.owner.length == 0) {
		this.makeOwner();
	}
}

module.exports = Room;
