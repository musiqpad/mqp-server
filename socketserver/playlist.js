var util = require('util');
var DB = require('./database');
var YT = require('./YT');
var log = new (require('basic-logger'))({showTimestamp: true, prefix: "Playlist"});


// Every user obj starts with this, then gets extended by what's in the db
var defaultObj = function(){
	return {
		name: '',
		owner: 0,
		created: 0,
		content: [],
		contentCache: []
	};
};

// These fields (key from defaultObj) are not sent to ANY clients
var fieldsPrivate = [
	'owner',
	'created',
	'contentCache'
];

// These fields (key from defaultObj) are not saved in the db
var fieldsNotSaved = [
	'contentCache'
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
 * @param {String} email
 * @param {Database} db
 * @param {Function} callback
 * @param {Boolean} newUser
 */
function Playlist(){
	this.data = new defaultObj;
	this.id = null;
}

Playlist.prototype.getFirstExpanded = function(callback){
	callback = callback || function(){};
	var that = this;
	
	if (this.data.content.length == 0){
		callback('NoSongsInPlaylist');
		return;
	}
	
	YT.getVideo(this.data.content[0], function(err, videoData){
		videoData = videoData || {};
		
		if ( videoData[ that.data.content[0] ] ){
			//that.data.contentCache[0]( videoData[ this.data.content[0] ] );
		}else{
			console.log('VIDEO DATA DOESN\'T EXIST');
			that.removeSong(that.data.content[0]);
			that.getFirstExpanded(callback);
			return;
		}
		
		
		callback(err, videoData[ that.data.content[0] ]);
	});
};

Playlist.prototype.getExpanded = function(callback){
	callback = callback || function(){};
	var that = this;

	YT.getVideo(this.data.content, function(err, videoData){
		if (err){
			callback(err);
			return;
		}

		var out = [];
		var changed = false;
		videoData = videoData || {};
		
		for (var i = 0; i < that.data.content.length; i++){
			
			// To fix a stupid mistake...
			if (Array.isArray(that.data.content[i])) that.data.content[i] = that.data.content[i][0];
			
			var id = that.data.content[i];
			
			if(videoData[id])
				out.push(videoData[id]);
			else {
				that.data.content.splice(i--, 1);
				changed = true;
			}
		}
		
		callback(null, out);
		
		if(changed) that.save();
	});
};

Playlist.prototype.addSong = function(cid, pos, callback, bypass){
	callback = callback || function(){};
	bypass = bypass || false;
	
	if (typeof cid !== 'string'){
		callback('CIDIsNotString');
		return;
	}
	
	if (pos != 'bottom' && pos != 'top')
		pos = 'top';
		
	var that = this;
	
	if(bypass){
		if (pos == 'top'){
			that.data.content.unshift(cid);
		}else if (pos == 'bottom'){
			that.data.content.push(cid);
		}
		
		that.save();
		
		callback(null, that.data, pos);
	} else {
		YT.getVideo(cid, function(err, data){
			if (err){callback(err); return;}
			if (data[cid]){
				if(data[cid].unavailable) { callback('VideoUnavailable'); return; }
				if (pos == 'top'){
					that.data.content.unshift(cid);
				}else if (pos == 'bottom'){
					that.data.content.push(cid);
				}
				
				that.save();
				
				callback(null, data, pos);
			}else{
				callback('ContentDoesNotExist');
			}
		});
	}
};

Playlist.prototype.removeSong = function(cid, callback){
	callback = callback || function(){};
	var ind = this.data.content.indexOf(cid);
	
	if (ind == -1){
		callback('SongNotInPlaylist');
		return;
	}
	
	this.data.content.splice(ind, 1);
	this.save();
	callback(null, this);
};

Playlist.prototype.moveSong = function(cid, newInd, callback){
	callback = callback || function(){};
	var ind = this.data.content.indexOf(cid);
	
	if (ind == -1){
		callback('SongNotInPlaylist');
		return;
	}
	
	this.data.content.splice(ind, 1);
	this.data.content.splice(( ind > newInd ? newInd : newInd-1), 0, cid);
	this.save();
	callback(null, this);
};

Playlist.prototype.shiftToBottom = function(){
	if (this.data.content.length == 0){
		//callback('NoSongsInPlaylist');
		return false;
	}
	
	var cid = this.data.content.shift();
	
	this.data.content.push( cid );
	this.save();
	
	return cid;
};

Playlist.prototype.save = function(callback){
	DB.putPlaylist(this.id, this.makeDbObj(), function(err, data){
		if (callback) callback(err, data);
	});
};

Playlist.prototype.del = function(){
	DB.deletePlaylist(this.id);
	this.data = util._extend({}, defaultObj);
	this.id = null;
};

Playlist.prototype.makeDbObj = function(){
	return removeFields(this.data, fieldsNotSaved);
};

Playlist.prototype.makeClientObj = function(callback){
	var tempPlaylist = util._extend({}, this.data);
	tempPlaylist.content = [];
	tempPlaylist.num = this.data.content.length;
	return removeFields(tempPlaylist, fieldsPrivate);
};

Object.defineProperty( Playlist.prototype, 'name', {
	get: function() {
		return this.data.name;
	},
	set: function(val) {
		
		this.data.name = val.substr(0, 100);
		this.save();
		
		return this;
	}
});


module.exports = Playlist;