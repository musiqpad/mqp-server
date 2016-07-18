'use strict';
const extend = require('extend');
const ws = require('ws');
const https = require('https');
const log = new (require('basic-logger'))({ showTimestamp: true, prefix: 'Room' });
const DJQueue = require('./djqueue.js');
const Roles = require('./role');
const DB = require('./database');
const nconf = require('nconf');

const DefaultDBObj = function () {
	return {
		roles: {},
		restrictions: {}, // Uses UID as key, object containing reason and end time as value.
		history: []
	};
};


class Room {
	constructor(socketServer, options) {
		const that = this;

		this.roomInfo = extend(true, {
			name: '', 							// Room name
			slug: '', 							// Room name shorthand (no spaces, alphanumeric with dashes)
			greet: '', 							// Room greetings
			maxCon: 0, 							// Max connections; 0 = unlimited
			ownerEmail: '', 				// Owner email for owner promotion
			guestCanSeeChat: true, 	// Whether guests can see the chat or not
			bannedCanSeeChat: true, // Whether banned users can see the chat
			roomOwnerUN: null, 			// Username of the room owner to use with lobby API
		}, options);

		this.socketServer = socketServer;
		this.queue = new DJQueue(this);
		this.attendeeList = [];
		this.data = new DefaultDBObj();
		this.apiUpdateTimeout = null;
		this.lastChat = [];
		this.createApiTimeout();

		this.restrictiontypes = [
			'BAN',
			'MUTE',
			'SILENT_MUTE'
		];

		DB.getRoom(this.roomInfo.slug, (err, data) => {
			// Just in case the slug doesn't exist yet
			data = data || {};

			// If the slug doesn't exist, make owner will make the slug
			if (err && !err.notFound) {
				console.log(err);
				return;
			}

			extend(true, that.data, data);

			that.makeOwner();
		});
	}

	getRoomMeta() {
		return {
			name: this.roomInfo.name,
			slug: this.roomInfo.slug,
			greet: this.roomInfo.greet,
			bg: this.roomInfo.bg,
			guestCanSeeChat: this.roomInfo.guestCanSeeChat,
			bannedCanSeeChat: this.roomInfo.bannedCanSeeChat,
			roomOwnerUN: this.roomInfo.roomOwnerUN
		};
	}

	makeOwner() {
		if (!nconf.get('room:ownerEmail')) return;

		const that = this;

		DB.getUser(this.roomInfo.ownerEmail, (err, data) => {
			if (err === 'UserNotFound') {
				console.log('Owner does not exist yet.');
				that.data.roles.owner = [];
				return;
			}
			if (err) {
				console.log(`Cannot make Room Owner: ${err}`);
				return;
			}

			if (typeof data.uid !== 'number') {
				console.log('Cannot make room owner: UserUIDError');
				return;
			}

			log.info(`Granting ${data.un} (${data.uid}) Owner permissions`);

			// Remove user from other roles to avoid interesting bugs
			for (const i in that.data.roles) {
				const ind = that.data.roles[i].indexOf(data.uid);
				if (ind > -1) that.data.roles[i].splice(ind, 1);
			}

			// Only one owner, set entire array to one UID and set owner username for API
			that.data.roles.owner = [data.uid];
			that.data.roomOwnerUN = data.un;
			that.roomInfo.roomOwnerUN = data.un;
			data.role = that.findRole(data.uid);
			that.sendUserUpdate(data);
			that.save();
		});
	}

	addUser(sock) {
		this.attendeeList.push(sock);
		let userSend = null;
		let numGuests = 0;
		sock.room = this.roomInfo.slug;

		if (sock.user) {
			this.checkMakeOwner();
			sock.user.data.role = this.findRole(sock.user.data.uid);
			userSend = sock.user.getClientObj();

			for (let i = 0; i < this.attendeeList.length; i++) {
				const sockObj = this.attendeeList[i];

				if (!sockObj.user) {
					numGuests++;
					continue;
				}

				if (sockObj === sock) continue;

				if (sockObj.user && sock.user && sockObj.user.data.uid === sock.user.data.uid) {
					this.removeUser(sockObj);
					sockObj.close(1000, JSON.stringify({
						type: 'ConnectedElsewhere'
					}));
				}
			}
		} else {
			for (let i = 0; i < this.attendeeList.length; i++) {
				const sockObj = this.attendeeList[i];

				if (!sockObj.user) {
					numGuests++;
				}
			}
		}

		// TODO: Find and add role key to user object from room db

		this.sendAll({
			type: 'userJoined',
			data: {
				user: userSend,
				guests: numGuests
			}
		},
			sockObj => sockObj !== sock);
	}

	replaceUser(sockOld, sockNew) {
		if (!sockOld || !sockOld.user || !sockNew || !sockNew.user || sockOld.user.data.uid !== sockNew.user.data.uid) return false;
		const ind = this.attendeeList.indexOf(sockOld);
		this.checkMakeOwner();
		if (ind === -1) return false;

		sockNew.room = this.roomInfo.slug;
		sockNew.user.data.role = this.findRole(sockOld.user.data.uid);
		this.attendeeList[ind] = sockNew;
		this.queue.replaceSocket(sockOld, sockNew);

		return true;
	}

	removeUser(sock) {
		const that = this;
		const ind = this.attendeeList.indexOf(sock);

		if (ind > -1) {
			sock.room = null;

			let userSend = null;

			this.queue.remove(sock);

			if (sock.user) {
				userSend = sock.user.getClientObj();
				sock.user.data.role = null;
			}

			this.attendeeList.splice(ind, 1);

			this.sendAll({
				type: 'userLeft',
				data: {
					user: userSend,
					guests: ((() => {
						let num = 0;
						for (let i = 0; i < that.attendeeList.length; i++) {
							if (!that.attendeeList[i].user) num++;
						}
						return num;
					}))()
				}
			});
		}
	}

	restrictUser(restrictObj, callback) {
		/*
		 Expects {
				restrictObj: {
						uid: uid,
						end: int,
						start: int,
						reason: '',
						type: '',
						source: {
								uid: uid,
								role: role
						}
				}
		 }
		*/
		const that = this;

		if (this.restrictiontypes.indexOf(restrictObj.type) === -1) {
			if (callback) callback('InvalidRestrictionType');
			return;
		}

		DB.getUserByUid(restrictObj.uid, (err, user) => {
			if (err) {
				if (callback) {
					callback(err);
				}
				return;
			}

			if (that.isUserRestricted(restrictObj.uid, restrictObj.type)) {
				if (callback) callback('UserAlreadyRestricted');
				return;
			}

			user.role = that.findRole(user.uid);

			if (!Roles.checkCanGrant(restrictObj.source.role, [user.role])) {
				if (callback) callback('UserCannotBeRestricted');
				return;
			}

			restrictObj.reason = restrictObj.reason.substr(0, 50);

			that.data.restrictions[restrictObj.uid] = that.data.restrictions[restrictObj.uid] || {};
			that.data.restrictions[restrictObj.uid][restrictObj.type] = restrictObj;
			that.save();

			that.sendAll({
				type: 'userRestricted',
				data: {
					uid: restrictObj.uid,
					type: restrictObj.type,
					source: restrictObj.source.uid,
				}
			}, obj => restrictObj.type !== 'SILENT_MUTE' || (obj.user && Roles.checkPermission(obj.user.role, 'room.restrict.silent_mute')));

			const userSock = that.findSocketByUid(restrictObj.uid);

			// Check if user is online
			if (userSock && restrictObj.type === 'BAN') {
				that.removeUser(userSock);
				userSock.close(1000, JSON.stringify({
					type: 'banned',
					data: {
						end: restrictObj.end,
						reason: restrictObj.reason
					}
				}));
			}

			if (callback) callback(null);
		});
	}

	getRestrictions(arr, uid) {
		const out = {};

		for (const key in this.data.restrictions[uid]) {
			if (key.indexOf(arr))
				out[key] = this.data.restrictions[uid][key];
		}

		return out;
	}

	unrestrictUser(uid, type, sock) {
		if (this.data.restrictions[uid][type]) {
			delete this.data.restrictions[uid][type];
			this.save();

			this.sendAll({
				type: 'userUnrestricted',
				data: {
					uid,
					type,
					source: (sock ? sock.user.data.uid : null)
				}
			}, obj => type !== 'SILENT_MUTE' || (obj.user && Roles.checkPermission(obj.user.role, 'room.restrict.silent_mute')));

			return true;
		}
		return false;
	}

	isUserRestricted(uid, type) {
		if ((this.data.restrictions[uid] || {})[type]) {
			if (this.data.restrictions[uid][type].end < new Date(Date.now())) {
				this.unrestrictUser(uid, type);
				return false;
			}
			return true;
		}
		return false;
	}

	setRole(user, role) {
		if (!user) return false;

		if (!role) role = 'default';

		role = role.toLowerCase();

		if (Roles.roleExists(role)) {
			if (typeof this.data.roles[role] === 'undefined') this.data.roles[role] = [];

			const userSock = this.findSocketByUid(user.uid);

			// Remove user from other role
			this.removeRole(user);

			if (role !== 'default') this.data.roles[role].push(user.uid);

			user.role = role;

			// Save the changes
			this.save();

			if (userSock) {
				// We can't assign this user object to the socket because it lacks playlists
				userSock.user.data.role = role;
			}

			this.sendUserUpdate(user);

			return true;
		}
		return false;
	}

	removeRole(user) {
		if (!user) return;

		for (const i in this.data.roles) {
			const ind = this.data.roles[i].indexOf(user.uid);
			if (ind > -1) {
				this.data.roles[i].splice(ind, 1);
			}
		}
	}

	findRole(uid) {
		if (!uid) return 'default';

		for (const i in this.data.roles) {
			const ind = this.data.roles[i].indexOf(uid);
			if (ind > -1 && Roles.roleExists(i)) {
				return i;
			}
		}

		return 'default';
	}

	findSocketByUid(uid) {
		for (const i in this.attendeeList) {
			if (!this.attendeeList[i].user) continue;

			if (this.attendeeList[i].user.data.uid === uid) return this.attendeeList[i];
		}

		return null;
	}

	getAttendees() {
		return this.attendeeList;
	}

	getBannedUsers(callback) {
		const banned = [];
		const rawBanned = [];
		const that = this;

		for (const i in this.data.restrictions) {
			// This will unban appropriately when the list is viewed.
			if (this.isUserRestricted(i, 'BAN'))
				rawBanned.push(i);
		}

		if (!rawBanned.length) {
			callback('NoBans');
			return;
		}

		DB.getUserByUid(rawBanned, { getPlaylists: false }, (err, users) => {
			for (const j in users) {
				const usr = users[j].getClientObj();
				usr.role = that.findRole(usr.uid);
				banned.push(usr);
			}

			callback(err, banned);
		});
	}

	getRoomStaff(callback) {
		const staff = [];
		let rawStaff = [];
		const that = this;

		for (const i in this.data.roles) {
			if (Roles.getStaffRoles().indexOf(i) > -1) {
				rawStaff = rawStaff.concat(this.data.roles[i]);
			}
		}

		if (!rawStaff.length) {
			callback('NoStaff');
			return;
		}

		DB.getUserByUid(rawStaff, { getPlaylists: false }, (err, users) => {
			for (const j in users) {
				const usr = users[j].getClientObj();
				usr.role = that.findRole(usr.uid);
				staff.push(usr);
			}

			callback(err, staff);
		});
	}

	sendSystemMessage(message) {
		this.sendAll({ type: 'systemMessage', data: message });
	}

	sendBroadcastMessage(message) {
		this.sendAll({ type: 'broadcastMessage', data: message });
	}

	sendMessage(sock, message, ext, specdata, callback) {
		const that = this;

		message = message.substring(0, 255).replace(/</g, '&lt;').replace(/>/g, '&gt;');

		callback = callback || (() => {});

		if (this.isUserRestricted(sock.user.uid, 'SILENT_MUTE')) {
			DB.logChat(sock.user.uid, message, 'res:mute_s', (err, cid) => {
				sock.sendJSON({
					type: 'chat',
					data: {
						uid: sock.user.uid,
						message,
						time: Date.now(),
						cid,
						special: specdata,
					}
				});
				callback(cid);
			});
		} else if (this.isUserRestricted(sock.user.uid, 'MUTE')) {
			callback(null);
		} else {
			DB.logChat(sock.user.uid, message, specdata, (err, cid) => {
				that.sendAll({
					type: 'chat',
					data: {
						uid: sock.user.uid, // Will always be present. Unauthd can't send messages
						message,
						time: Date.now(),
						cid,
						special: specdata
					}
				}, obj => {
					// Guests can't see chat with config variable set
					if (!that.roomInfo.guestCanSeeChat && !obj.user) return false;

					// Banned users can't see chat with config variable set
					if (!that.roomInfo.bannedCanSeeChat && obj.user && that.isUserRestricted(obj.user.uid, 'BAN')) return false;

					// Check for extensive function
					if (typeof ext === 'function') if (!ext(obj)) return false;

					return true;
				});

				// Save last X messages to show newly connected users
				if (!specdata) {
					that.lastChat.push({
						user: sock.user.getClientObj(),
						message,
						time: Date.now(),
						cid,
					});
					if (that.lastChat.length > nconf.get('room:lastmsglimit')) that.lastChat.shift();
				}

				callback(cid);
			});
		}
	}

	makePrevChatObj() {
		const uids = [];
		const temp = extend(true, [], this.lastChat);

		for (let i = 0; i < temp.length; i++) {
			const ind = uids.indexOf(temp[i].user.uid);
			if (ind === -1) {
				uids.push(temp[i].user.uid);
				continue;
			}

			temp[i].user = { uid: temp[i].user.uid };
		}

		return temp;
	}

	deleteChat(cid, uid) {
		for (let i = 0; i < this.lastChat.length; i++) {
			if (this.lastChat[i].cid === cid) {
				this.lastChat.splice(i, 1);
				break;
			}
		}

		this.sendAll({
			type: 'deleteChat',
			data: {
				cid,
				mid: uid
			}
		});
	}

	sendAll(message, condition) {
		if (!condition) condition = () => true;
		for (const i in this.attendeeList) {
			const obj = this.attendeeList[i];

			if (obj.readyState !== ws.OPEN || !condition(obj)) continue;

			obj.sendJSON(message);
		}
	}

	sendUserUpdate(user) {
		if (!user) return;

		this.sendAll({
			type: 'userUpdate',
			data: {
				user: user.getClientObj()
			}
		});
	}

	getUsersObj() {
		const temp = {
			guests: 0,
			users: {}
		};

		for (let i = 0; i < this.attendeeList.length; i++) {
			const obj = this.attendeeList[i];
			if (!obj.user) {
				temp.guests++;
				continue;
			}

			temp.users[obj.user.uid] = obj.user.getClientObj();
		}

		return temp;
	}

	getHistoryObj() {
		return this.data.history.slice(-nconf.get('room:history:limit_send')).reverse();
	}

	addToHistory(historyObj) {
		// Limit history
		if (nconf.get('room:history:limit_save') !== 0) {
			while (this.data.history.length >= nconf.get('room:history:limit_save')) {
				this.data.history.shift();
			}
		}

		// Add to history and save
		this.data.history.push(historyObj);
		this.save();
	}

	updateLobbyServer(song, dj, callback) {
		if (!nconf.get('apis:musiqpad:sendLobbyStats')) {
			if (callback) callback();
			return;
		} else if (!nconf.get('apis:musiqpad:key') || nconf.get('apis:musiqpad:key') === '') {
			console.log('A musiqpad key must be defined in the config for updating the lobby server.');
			return;
		}
		const postData = {
			song,
			dj,
			room: this.getRoomMeta(),
			userCount: this.attendeeList.length
		};
		const postOptions = {
			host: 'api.musiqpad.com',
			port: '443',
			path: `/pad/${this.roomInfo.slug}`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				apikey: nconf.get('apis:musiqpad:key')
			}
		};
		try {
			const postReq = https.request(postOptions, response => {
				if (response.statusCode < 200 || response.statusCode > 299) {
					console.log(`Request Failed with Status Code: ${response.statusCode}`);
				}
				if (callback) callback();
			});
			postReq.write(JSON.stringify(postData));
			postReq.on('error', () => {
				postReq.end();
				console.log('Lobby Update errored.');
			});
			postReq.setTimeout(3000, () => {
				console.log('Lobby Update timed out.');
				postReq.abort();
			});
			postReq.end();
		} catch (e) { }

		this.createApiTimeout();
	}

	createApiTimeout() {
		const that = this;
		clearTimeout(this.apiUpdateTimeout);

		this.apiUpdateTimeout = setTimeout(() => {
			if (that.queue.currentsong && that.queue.currentdj) {
				that.updateLobbyServer(that.queue.currentsong, that.queue.currentdj ? that.queue.currentdj.user.getClientObj() : null);
			} else {
				that.updateLobbyServer(null, null);
			}
		}, 300000);
		return this.apiUpdateTimeout;
	}

	sockIsJoined(sock) {
		if (this.attendeeList.indexOf(sock) > -1)	return true;
		return false;
	}

	makeDbObject() {
		return this.data;
	}

	save() {
		DB.setRoom(this.roomInfo.slug, this.makeDbObject());
	}

	checkMakeOwner() {
		if (this.data.roles.owner && this.data.roles.owner.length === 0) {
			this.makeOwner();
		}
	}
}

module.exports = Room;
