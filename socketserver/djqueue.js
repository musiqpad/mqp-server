var Roles = require('./role');
const nconf = require('nconf');

var defaultVoteObj = function(){
	return {
		like: [],
		dislike: [],
		grab: []
	};
};

function makeSongObj(input){
	if (!input) return input;

	delete input.thumbnail;
	return input;
}

/* DJ Queue Object Start */
function djqueue(room){
	if (!room){
		return;
	}

	this.room = room;
	this.users = [];
	this.lastdj = null;
	this.lastsong = null;
	this.currentdj = null;
	this.currentsong = null;
	this.songstart = null;
	this.lasttimer = null;
	this.limit = nconf.get('room:queue:limit');
	this.cycle = nconf.get('room:queue:cycle');
	this.lock = nconf.get('room:queue:lock');
	this.votes = new defaultVoteObj;
}


djqueue.prototype.add = function(sock, position){
	var res = this._add(sock, position);
	if(res.success){

		if(this.users.length == 1 && this.currentdj == null)
			this.advance();
	}
	return res;
};

djqueue.prototype._add = function(sock, position){
	var res = {success: false};

	if(sock.user && this.checkQueuePos(sock) == -1 && (this.currentdj == null ? null : this.currentdj.user.uid) != sock.user.uid){
		res.success = true;
		position = parseInt(position);

		if (isNaN(position) || position < 0 || position >= this.users.length){
			this.users.push(sock);
		}else{
			res.position = position;
			this.users.splice(position, 0, sock);
		}

		this.room.sendAll({
			type: "userJoinedQueue",
			data: {
				queueList: this.makeClientObj()
			}
		});
	}
	return res;
};

djqueue.prototype.replaceSocket = function(sock_old, sock_new){
	var qpos = this.users.indexOf(sock_old);

	if (qpos >= 0) this.users[qpos] = sock_new;
	if (this.currentdj == sock_old) this.currentdj = sock_new;

	var lpos = this.votes.like.indexOf(sock_old);
	var dpos = this.votes.dislike.indexOf(sock_old);
	var gpos = this.votes.grab.indexOf(sock_old);

	if (lpos >= 0) this.votes.like[lpos] = sock_new;
	if (dpos >= 0) this.votes.dislike[dpos] = sock_new;
	if (gpos >= 0) this.votes.grab[gpos] = sock_new;
};

djqueue.prototype.remove = function(sock, type){
	var index = this.checkQueuePos(sock);

	// Remove their vote
	for (var i in this.votes){
		if (this.votes[i].indexOf(sock) > -1) this.vote(i, sock, true);
	}

	if(index != -1){
		this.users.splice(index, 1);

		this.room.sendAll({
			type: type == undefined ? "userLeftQueue" : type,
			data: {
				queueList: this.makeClientObj()
			}
		});

		return true;
	} else if (sock.user && this.currentdj && this.currentdj.user.uid == sock.user.uid){
		this.advance( true );
		return true;
	}



	return false;
};

djqueue.prototype.move = function(sock, to){
	var from = this.checkQueuePos(sock);
	var res = {success: false};

	if (from == to){
		//TODO: Return error to sender, might need to add a callback
		return res;
	}

	if(to < this.users.length && to >= 0 && from != -1 && sock != this.currentdj){
		this.users.splice(from, 1);
		var pos = (to > from+1 ? to-1 : to);
		this.users.splice( pos, 0, sock);

		res.success = true;
		res.data = {
			queueList: this.makeClientObj(),
			uid: sock.user.data.uid,
			from: from,
			to: to
		};
	}
	return res;
};

djqueue.prototype.swap = function(sock1, sock2){
	var from = this.checkQueuePos(sock1);
	var to = this.checkQueuePos(sock2);
	var res = {success: false};

	if(from != -1 && to != -1 && sock1 != this.currentdj && sock2 != this.currentdj ){
		this.users[from] = sock2;
		this.users[to] = sock1;

		res.data = {
			queueList: this.makeClientObj(),
			uid1: sock1.user.data.uid,
			uid2: sock2.user.data.uid,
			pos1: from,
			pos2: to
		};

		res.success = true;
	}
	return res;
};

djqueue.prototype.advance = function( ignoreCycle, lockSkipPosition ){
	if(this.currentdj){
		this.currentdj.user.lastdj = false;
	}
	this.lastdj = this.currentdj;
	this.lastsong = this.currentsong;
	this.currentsong = null;
	clearTimeout(this.lasttimer);

	var isSetLockSkipPos = typeof lockSkipPosition === 'number' && !isNaN(lockSkipPosition);
	var res = {success: false};

	if(this.users.length >= 1){
		if (this.currentdj && (this.cycle || isSetLockSkipPos) && !ignoreCycle) {
			this.currentdj = null;
			res.position = this._add(this.lastdj, lockSkipPosition).position;
		}
		res.success = true;
		this._advance();
	} else if (this.currentdj != null) {
		this.currentdj = null;
		if((this.cycle || isSetLockSkipPos) && !ignoreCycle) {
			res.position = this._add(this.lastdj, lockSkipPosition).position;
		}

		this._advance();
		res.success = true;
	}
	return res;
};

djqueue.prototype._advance = function(){
	var that = this;
	var lastStart = that.songstart;

	if (that.lastsong != null) {
		var historyObj = {
			votes: {
				like: that.votes.like ? that.votes.like.length : 0,
				grab: that.votes.grab ? that.votes.grab.length : 0,
				dislike: that.votes.dislike ? that.votes.dislike.length : 0
			},
			song: makeSongObj(that.lastsong),
			user: (that.lastdj ? that.lastdj.user.getClientObj() : null),
			start: lastStart
		};
		that.room.addToHistory(historyObj);
	}

	if (this.users.length > 0){
		this.currentdj = this.users.splice(0, 1)[0];
		var pl = this.currentdj.user.playlistCache[this.currentdj.user.activepl];

		pl.getFirstExpanded(function(err, data){
			if (err){
				return that._advance();
			}

			//Show the unavailable song for a limited amount of time
			if(data.unavailable){
				data.duration = 5;
			}

			that.currentsong = data;
			pl.shiftToBottom();

			that.songstart = Date.now();
			that.room.sendAll({
				type: "advance",
				data: {
					last: {
						song: makeSongObj(that.lastsong),
						uid: (that.lastdj && that.lastdj.user ? that.lastdj.user.uid : null),
						start: lastStart
					},
					next: {
						song: makeSongObj(that.currentsong),
						uid: (that.currentdj && that.currentdj.user ? that.currentdj.user.uid : null),
						start: that.songstart
					}
				}
			});

			//	Allow to play streaming or live videos
			if (that.currentsong && that.currentsong.duration > 0 || !Roles.checkPermission(that.currentdj.user.role, 'djqueue.playLiveVideos')){
				that.lasttimer = setTimeout(function(){
					that.advance(that.currentdj.user.lastdj);
				}, that.currentsong.duration * 1000);
			}

			that.votes = new defaultVoteObj;

			if (that.currentsong && that.currentdj){
				that.room.updateLobbyServer(that.currentsong, that.currentdj ? that.currentdj.user.getClientObj() : null);
			}
		});
	}else{
		//if (that.lastsong === null || that.lastdj === null) return;

		that.votes = new defaultVoteObj;
		that.songstart = null;

		that.room.sendAll({
			type: "advance",
			data: {
				last: {
					song: makeSongObj(that.lastsong),
					uid: (that.lastdj ? that.lastdj.user.uid : null),
					start: lastStart
				},
				next: {
					song: null,
					uid: null,
					start: that.songstart
				}
			}
		});
		that.room.updateLobbyServer(null, null);
	}

	return false;
};

djqueue.prototype.skip = function(){
	if(this.currentdj != null){
		return this.advance(this.currentdj.user.lastdj);
	}
	return {success: false};
};

djqueue.prototype.modSkip = function(lockSkipPosition){
	if(this.currentdj != null){
		return this.advance((typeof lockSkipPosition === 'number' && !isNaN(lockSkipPosition)) ? false : this.currentdj.lastdj, lockSkipPosition);
	}
	return {success: false};
};

djqueue.prototype.toggleCycle = function(){
	this.cycle = !this.cycle;

	return this.cycle;
};

djqueue.prototype.toggleLock = function(){
	this.lock = !this.lock;

	return this.lock;
};

djqueue.prototype.setLimit = function(limit){
	if(limit >= 1){
		this.limit = limit;
		return true;
	}
	return false;
};

djqueue.prototype.vote = function(voteType, sock, leaving){
	voteType = voteType.toLowerCase();
	if (['like', 'dislike', 'grab'].indexOf(voteType) == -1) return false;
	if (!this.currentdj) return false;
	if (!sock.user) return false;
	if (sock.user.uid == this.currentdj.user.uid) return false;

	var ind = this.votes[voteType].indexOf(sock);

	if (ind > -1){
		if (voteType == 'grab' && !leaving) return false;

		this.votes[voteType].splice(ind, 1);
	}else{
		if (voteType == 'like' && this.votes.dislike.indexOf(sock) > -1){
			this.vote('dislike', sock);
		}else if (voteType == 'dislike' && this.votes.like.indexOf(sock) > -1){
			this.vote('like', sock);
		}

		this.votes[voteType].push(sock);
	}

	this.room.sendAll({
		type: 'voteUpdate',
		data: {
			votes: this.makeVoteObj(),
			uid: sock.user.uid,
			action: voteType,
			voted: (ind > -1 ? -1 : 1) // -1 for removed vote, 1 for added vote
		},
	});

	return true;
};

djqueue.prototype.makeClientObj = function(){
	var arr = [];
	for(var i =0; i < this.users.length; i++){
		arr.push(this.users[i].user.uid);
	}

	return arr;
};

djqueue.prototype.makeVoteObj = function(){
	return {
		like: this.votes.like.length,
		dislike: this.votes.dislike.length,
		grab: this.votes.grab.length
	};
};


djqueue.prototype.getVotes = function(){
	var like = [];
	var dislike = [];
	var grab = [];

	for (var i in this.votes.like)	like.push(this.votes.like[i].user.uid);
	for (var i in this.votes.dislike)	dislike.push(this.votes.dislike[i].user.uid);
	for (var i in this.votes.grab)	grab.push(this.votes.grab[i].user.uid);
	return {
		like: like,
		dislike: dislike,
		grab: grab
	};
};

djqueue.prototype.getUserVote = function(socket){
	var votes = [];

	if (!socket.user) return votes;

	if (this.votes.like.filter(function(a){ return a.user.uid == socket.user.uid;}).length != 0)	votes.push('like');
	if (this.votes.dislike.filter(function(a){ return a.user.uid == socket.user.uid;}).length != 0)	votes.push('dislike');
	if (this.votes.grab.filter(function(a){ return a.user.uid == socket.user.uid;}).length != 0)	votes.push('grab');
	return votes;
};


djqueue.prototype.getCurrentTime = function(){
	if (!this.currentsong || this.currentsong.duration == 0 || !this.currentdj) return 0;


	return Math.abs((Date.now( )- this.songstart) / 1000);
};

djqueue.prototype.checkQueuePos = function(sock){
	if (!sock.user) return -1;
	for(var i =0; i < this.users.length; i++){
		if(this.users[i].user.uid == sock.user.uid) return i;
	}
	return -1;
	//return this.users.indexOf( sock );
};

djqueue.prototype.isPlaying = function(sock){
	return sock == this.currentdj || this.checkQueuePos(sock) != -1;
};

/* DJ Queue Object End */

module.exports = djqueue;
