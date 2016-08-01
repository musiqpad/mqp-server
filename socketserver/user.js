'use strict'
const util = require('util');
let DB;
const utils = require('./utils');

// Every user obj starts with this, then gets extended by what's in the db
var defaultObj = function(){
	return {
		uid: 0,
		un: "",
		pw: "", 
		role: null,
		activepl: null,
		created: 0,
		playlists: [],
		playlistCache: {},
		badge: { top: '#000000', bottom: '#000000' },
		confirmation: null,
		recovery: {
			code: null,
			timeout: null,
		},
		uptime: 0,
		temp_uptime: Date.now(),
		lastdj: false,
		salt: '',
		blocked: [],
	};
};

// These fields (key from defaultObj) are not sent to OTHER clients (only public information should be sent)
var fieldsNotSent = [
	'pw',
	'activepl',
	'playlists',
	'playlistCache',
	'recovery',
	'confirmation',
	'uptime',
	'temp_uptime',
	'created',
	'lastdj',
	'salt',
	'blocked',
];

// These fields (key from defaultObj) are not saved in the db
var fieldsNotSaved = [
	'role',
	'playlistCache',
	'temp_uptime',
];

// These fields (key from defaultObj) are not sent to ANY clients
var fieldsPrivate = [
	'pw',
	'playlistCache',
	'recovery',
	'confirmation',
	'temp_uptime',
	'salt',
];

/**
 * removeFields() creates a shallow copy of an object and removes properties from it
 *
 * @param {Object} obj: Original object
 * @param {Array} fields: Array of fields to remove
 * @return {Object} Copy of bject with fields removed
 */
 
function removeFields(obj, fields){
	var updatedObj = util._extend({}, obj);
	for (var i in fields) {
		if ( typeof updatedObj[fields[i]] !== 'undefined' ) {
			delete updatedObj[fields[i]];
		}
	}
	
	return updatedObj;
}


/**
 * User() creates a standardized User object to manipulate and update
 *
 */
function User(){
	DB = require('./database');
	this.userExists = false;
	this.data = new defaultObj;
}

/**
 * login() logs in and updates the user object if successful.
 *
 * @param {Object} inData
 * @param {Function} callback(err): 
 * 	{String} err : null if successfull.  String if failed.
 * 
 * Errors:
 * 	InvalidArgs: One or more required arguments are missing.
 */
User.prototype.login = function(inEmail, inData, opts, callback){
	var that = this;
	
	if (typeof opts === 'function'){
		callback = opts;
		opts = {};
	}
	
	var defaultOpts = {
		getPlaylists: true
	};
	
	opts = util._extend(defaultOpts, opts);
	
	that.userExists = true;
	that.email = inEmail;
	if ( typeof inData === 'object' ) util._extend(that.data, inData);
	
	var reqSent = ( opts.getPlaylists ? this.data.playlists.length : 0 );
	var reqRec = 0;
	
	if (reqSent > 0){
		for (var i = 0; i < reqSent; i++){
			DB.getPlaylist(this.data.playlists[i], function(err, pl){
				that.data.playlistCache[ pl.id ] = pl;
				
				reqRec++;
				if (reqRec == reqSent){
					callback(null, that);
				}
			});
		}
	}else{
		if (callback) callback(null, this);
	}
	
	return this;
};

User.prototype.addPlaylist = function (name, callback) {
	var that = this;
	
	DB.createPlaylist(this.data.uid, name, function(err, pl){
		if (err){ 
			callback(err);
			return;
		}
		that.data.playlists.push(pl.id);
		
		that.data.playlistCache[pl.id] = pl;
		
		if (that.data.playlists.length == 1) 
			that.data.activepl = pl.id;
		
		that.updateUser();
		
		callback(null, pl);
	});
};

User.prototype.removePlaylist = function (pid, callback) {
	var plIndex = this.data.playlists.indexOf(pid); // Confirms ownership
	if (plIndex > -1) {
		this.data.playlistCache[ pid ];
		this.data.playlists.splice(plIndex, 1);
		
		DB.deletePlaylist(pid);
		if (this.data.activepl == pid){
			if (this.data.playlists.length > 0){
				this.data.activepl = this.data.playlists[0];
			}else{
				this.data.activepl = null;
			}
		}
		this.updateUser();
		
		callback(null, pid, this.data.activepl);
		return;
	}
	
	callback('PlaylistNotFound');
};

User.prototype.addBlockedUser = function(uid, callback) {
	var index = this.data.blocked.indexOf(uid);

	if(index != -1) {
		callback('UserAlreadyBlocked');

	} else if(this.data.uid == uid) {
		callback('CannotBlockSelf');

	} else {
		this.data.blocked.push(uid);
		this.updateUser();
		callback(null, true);
	}
};

User.prototype.removeBlockedUser = function(uid, callback) {
	var index = this.data.blocked.indexOf(uid);

	if(index == -1) {
		callback('UserNotBlocked');

	} else {
		this.data.blocked.splice(index, 1);
		this.updateUser();
		callback(null, true);
	}
}

/**
 * getClientObj() Returns public information to be sent to clients
 *
 * @return {Object} 
 */
User.prototype.getClientObj = function(){
	return removeFields(this.data, fieldsNotSent);
};

/**
 * makeDbObj() Returns object saved in the DB
 *
 * @return {Object} 
 */
User.prototype.makeDbObj = function(){
	return removeFields(this.data, fieldsNotSaved);
};

/**
 * makeUserObj() Makes object to be sent to client.  NOT to other users.
 *
 * @return {Object} 
 */
User.prototype.makeUserObj = function(){
	var tempUser = JSON.parse(JSON.stringify(this.data));
	
	tempUser.playlists = {};
	
	for (var i in this.playlistCache){
		tempUser.playlists[i] = this.playlistCache[i].makeClientObj();
	}
	
	return removeFields(tempUser, fieldsPrivate);
};

User.prototype.updateUser = function(){
	var updatedUserObj = removeFields(this.data, fieldsNotSaved);
	DB.putUser(this.email, updatedUserObj);
};



Object.defineProperty( User.prototype, 'uid', {
	get: function() {
		return this.data.uid;
	}
});

Object.defineProperty( User.prototype, 'un', {
	get: function() {
		return this.data.un;
	}
});

Object.defineProperty( User.prototype, 'pw', {
	get: function() {
		return this.data.pw;
	},
	set: function(val) {
		this.data.pw = utils.hash.bcrypt(val);
		this.updateUser();
		return this;
	}
});

Object.defineProperty( User.prototype, 'role', {
	get: function() {
		return this.data.role;
	},
	set: function(val) {
		this.data.role = val;
		// We do NOT want to save this value
	}
});

Object.defineProperty( User.prototype, 'activepl', {
	get: function() {
		return this.data.activepl;
	},
	set: function(val) {
		this.data.activepl = val;
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'created', {
	get: function() {
		return this.data.created;
	},
	set: function(val) {
		this.data.created = val;
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'badge', {
	get: function() {
		return this.data.badge;
	},
	set: function(val) {
		if (typeof val !== 'object' || Array.isArray(val)) return;
		this.data.badge = val;
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'playlists', {
	get: function() {
		return this.data.playlists;
	}
});

Object.defineProperty( User.prototype, 'playlistCache', {
	get: function() {
		return this.data.playlistCache;
	}
});

Object.defineProperty( User.prototype, 'confirmation', {
	get: function() {
		return this.data.confirmation;
	},
	set: function(val) {
		if(val != null) return;
		this.data.confirmation = val;	
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'recovery', {
	get: function() {
		return this.data.recovery;
	},
	set: function(val) {
		this.data.recovery.code = val;
		if(val != null) this.data.recovery.timeout = Date.now() + (24 * 60 * 60 * 1000);
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'uptime', {
	get: function() {
		return this.data.uptime;
	},
	set: function(val) {
		this.data.uptime = val;
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'temp_uptime', {
	get: function() {
		return this.data.temp_uptime;
	},
	set: function(val) {
		this.data.temp_uptime = val;
	}
});

Object.defineProperty( User.prototype, 'lastdj', {
	get: function() {
		return this.data.lastdj;
	},
	set: function(val) {
		this.data.lastdj = val;
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'salt', {
	get: function() {
		return this.data.salt;
	},
	set: function(val) {
		this.data.salt = val;
		this.updateUser();
	}
});

Object.defineProperty( User.prototype, 'blocked', {
	get: function() {
		return this.data.blocked;
	},
	set: function(val) {
		this.data.blocked = val;
		this.updateUser();
	}
});

module.exports = User;
