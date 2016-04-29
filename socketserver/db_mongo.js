//Modules
var mongodb = require('mongodb').MongoClient;
var util = require('util');
var log = new(require('basic-logger'))({
    showTimestamp: true,
    prefix: "MongoDB"
});

//Files
var config = require('../serverconfig.js');
var Mailer = require('./mailer');
var DBUtils = require('./database_util');

//Variables
var expires = 1000 * 60 * 60 * 24 * config.loginExpire;
var usernames = [];
var db = null;
var poolqueue = [];

function dbQueue(callback) {
    if (!db) {
        return poolqueue.push(callback);
    }
    
    if (!callback) {
        while (poolqueue.length > 0)
            (poolqueue.shift())();
        
        return;
    }
    
    callback();
}

function MongoDB(cb) {
	var dburl = 'mongodb://' + config.db.mongoUser + ':' + config.db.mongoPassword + '@' + config.db.mongoHost + ':27017/' + config.db.mongoDatabase;
    var step = 0;
    var total = 4;
    
	mongodb.connect(dburl, function(err, database) {
		if (err) {
			throw new Error('Could not connect to database: ' + err);
		}
		
		//Playlis
		database.collection('playlists').findOne({_id: 'PIDCOUNTER'}, function(err, pidobj) {
			if (err) {
                throw new Error('Cannot get PIDCOUNTER from playlists');
            }

			if (!pidobj) {
				database.collection('playlists').insert({_id: "PIDCOUNTER", seq: 1}, function(error, data) {
					if (error) {
                        throw new Error('Cannot set PIDCOUNTER to playlists');
                    }
                    step++;
                    if (step == total){
                        db = database;
                        dbQueue();
                    }
				});
			} else {
			    step++;
		        if (step == total){
                    db = database;
                    dbQueue();
                }
			}
		});
		
		//Users
		database.collection('users').findOne({_id: 'UIDCOUNTER'}, function(err, pidobj) {
			if (err) {
                throw new Error('Cannot get UIDCOUNTER from users');
            }

			if (!pidobj) {
				database.collection('users').insert({_id: "UIDCOUNTER", seq: 1}, function(error, data) {
					if (error) {
                        throw new Error('Cannot set UIDCOUNTER to users');
                    }
                    step++;
                    if (step == total){
                        db = database;
                        dbQueue();
                    }
				});
			} else {
			    step++;
			    if (step == total){
                    db = database;
                    dbQueue();
                }
			}
		});
		
		//Chat
		database.collection('chat').findOne({_id: 'CIDCOUNTER'}, function(err, pidobj) {
			if (err) {
                throw new Error('Cannot get CIDCOUNTER from chat');
            }
			if (!pidobj) {
				database.collection('chat').insert({_id: "CIDCOUNTER", seq: 1}, function(error, data) {
					if (error) {
                        throw new Error('Cannot set CIDCOUNTER to chat');
                    }
                    step++;
			        if (step == total){
                        db = database;
                        dbQueue();
                    }
				});
			} else {
			    step++;
			    if (step == total){
                    db = database;
                    dbQueue();
                }
			}
		});
		
		//PMs
		database.collection('pms').findOne({_id: 'PMIDCOUNTER'}, function(err, pidobj) {
			if (err) {
                throw new Error('Cannot get PMIDCOUNTER from pms');
            }
			if (!pidobj) {
				database.collection('pms').insert({_id: "PMIDCOUNTER", seq: 1}, function(error, data) {
					if (error) {
                        throw new Error('Cannot set PMIDCOUNTER to pms');
                    }
                    step++;
			        if (step == total){
                        db = database;
                        dbQueue();
                    }
				});
			} else {
			    step++;
			    if (step == total){
                    db = database;
                    dbQueue();
                }
			}
		});
	});
}

function getNextSequence(collection, id, callback) {
    dbQueue(function(){
        db.collection(collection).findOneAndUpdate({_id: id}, { $inc: { seq: 1 } }, function(err, r) {
    		if (err) throw new Error('Cannot update index counter');
        	callback(r.value.seq);
        });
    });
}

//PlaylistDB
MongoDB.prototype.getPlaylist = function(pid, callback) {
    var Playlist = require('./playlist');
    
    dbQueue(function(){
    	db.collection('playlists').findOne({_id: pid}, {_id: 0}, function(err, data) {
            if (err || !data) {
            	callback('PlaylistNotFound');
            	return;
            }
            
            var pl = new Playlist();
            pl.id = pid;
            util._extend(pl.data, data);
    
            callback(err, pl);
    	});
    });
	
    return this;
};

MongoDB.prototype.createPlaylist = function(owner, name, callback) {
    var Playlist = require('./playlist');

    dbQueue(function(){
        getNextSequence('playlists', 'PIDCOUNTER', function(currentPID) {
        	var pl = new Playlist();
        	
        	pl.id = currentPID;
        	pl.data.created = Date.now();
    	    pl.data.owner = owner;
    	    pl.data.name = name.substr(0, 100);
    	    
    	    var updatedPlObj = pl.makeDbObj();
    	    updatedPlObj._id = currentPID;
    	    
    	    db.collection('playlists').insert(updatedPlObj, function(error, data) {
    	    	callback(error, pl);
    	    });
        });
    });
};

MongoDB.prototype.deletePlaylist = function(pid, callback) {
	dbQueue(function(){
	    db.collection('playlists').remove({_id: pid}, callback);
	});
};


MongoDB.prototype.putPlaylist = function(pid, data, callback) {
    var newData = {};
    util._extend(newData, data);
    
    newData._id = pid;
    
    dbQueue(function(){
        db.collection('playlists').updateOne({_id: pid}, newData, {upsert:true, w: 1}, function(error, res) {
        	callback(data);
        });
    });
};

//RoomDB
MongoDB.prototype.getRoom = function(slug, callback) {
    dbQueue(function(){
	    db.collection('room').findOne({slug: slug}, {_id: 0}, callback);
    });
    return this;
};

MongoDB.prototype.setRoom = function(slug, val, callback) {
    dbQueue(function(){
        var newData = {};
        util._extend(newData, val);
    
        newData.slug = slug;
    	db.collection('room').updateOne({slug: slug}, newData, {upsert:true, w: 1}, function(error, data) {
        	if (callback) callback(error, data);
        });
    });
    return this;
};

//TokenDB
MongoDB.prototype.deleteToken = function(tok) {
	 dbQueue(function(){
	     db.collection('tokens').remove({tok: tok}, function(){});
	 });
};

MongoDB.prototype.createToken = function(email) {
    var tok = DBUtils.makePass(email, Date.now());

    dbQueue(function(){
    	db.collection('tokens').insert({
    		tok: tok,
            email: email,
            time: Date.now(),
        }, function() {});
     });

    return tok;
};

MongoDB.prototype.isTokenValid = function(tok, callback) {
    var that = this;

    dbQueue(function(){
    	db.collection('tokens').findOne({tok: tok}, function(err, data) {
    		if (err || data == null) {
                callback('InvalidToken');
                return;
            }
    
            if (config.loginExpire && (Date.now() - data.time) < expires) {
                callback(null, data.email);
            } else {
                that.deleteToken(data.token);
                callback('InvalidToken');
            }
    	});
    });
};

//UserDB
function addUsername(un) {
    usernames.push(un.toLowerCase());
}

function usernameExists(un) {
    un = un.toLowerCase();

    var ind;
    return ((ind = usernames.indexOf(un)) != -1 ? ind : false);
}

MongoDB.prototype.createUser = function(obj, callback) {
    var User = require('./user');
    var that = this;

    var defaultCreateObj = {
        email: null,
        un: null,
        pw: null
    };
    util._extend(defaultCreateObj, obj);

    var inData = defaultCreateObj;
    inData.email = inData.email.toLowerCase();

    //Validation
    if (!inData.email || !DBUtils.validateEmail(inData.email)) {
        callback('InvalidEmail');
        return;
    }
    if (!inData.un || !DBUtils.validateUsername(inData.un)) {
        callback('InvalidUsername');
        return;
    }
    if (usernameExists(inData.un) !== false) {
        callback('UsernameExists');
        return;
    }
    if (!inData.pw || inData.pw == 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
        callback('PasswordBlank');
        return;
    }

    dbQueue(function(){
        //Check for existing account
        that.userEmailExists(inData.email, function(err, res) {
            if (err) {
                if (callback) callback('AccountExists');
                return;
            }
            
            getNextSequence('users', 'UIDCOUNTER', function(currentUID) {
                var user = new User();
                
                user.data.uid = currentUID;
                user.data.un = inData.un;
                user.data.salt = DBUtils.makePass(Date.now()).slice(0, 10);
                user.data.pw = DBUtils.makePass(inData.pw, user.data.salt);
                user.data.created = Date.now();
                if (config.room.email.confirmation) user.data.confirmation = DBUtils.makePass(Date.now());
                var updatedUserObj = user.makeDbObj();
                updatedUserObj._id = currentUID;
                updatedUserObj.email = inData.email;
        
                var tok = that.createToken(inData.email);
                
                db.collection('users').insert(updatedUserObj, function(error, data) {
        			if (error) {
                        callback(error);
                        return;
                    }
        
                    //Send confirmation email
                    if (config.room.email.confirmation) {
                        Mailer.sendEmail('signup', {
                            code: user.data.confirmation,
                            user: inData.un,
                        }, inData.email, function(data) {
                            console.log(data);
                        });
                    }
        
                    //Do other ~messy~ stuff
                    addUsername(inData.un);
                    user.login(inData.email);
                    callback(null, user, tok);
        		});
            });
            
        });
    });
};

MongoDB.prototype.loginUser = function(obj, callback) {
    var User = require('./user');
    var that = this;

    var defaultLoginObj = {
        email: null,
        pw: null,
        token: null,
    };
    util._extend(defaultLoginObj, obj);

    var inData = defaultLoginObj;

    dbQueue(function(){
        if (inData.email && inData.pw) {
            inData.email = inData.email.toLowerCase();
            
            db.collection('users').findOne({email: inData.email}, {_id: 0}, function(err, data) {
                if (err) {
                    callback(err);
                    return;
                }
                
                if (!data) {
                    callback('UserNotFound');
                    return;
                }
    
                if (DBUtils.makePass(inData.pw, data.salt) != data.pw) {
                    callback('IncorrectPassword');
                    return;
                }
    
                var tok = that.createToken(inData.email);
                var user = new User();
    
                user.login(inData.email, data, function() {
                    callback(null, user, tok);
                });
            });
        } else if (inData.token) {
            that.isTokenValid(inData.token, function(err, email) {
                if (err) {
                    callback(err);
                    return;
                }
    
                db.collection('users').findOne({email: email}, {_id: 0}, function(err, data) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    
                    if (!data) {
                        callback('UserNotFound');
                        return;
                    }
                    
                    var user = new User();
                    user.login(email, data, function() {
                        
                        callback(null, user);
                    });
                });
            });
        } else {
            callback('InvalidArgs');
        }
    });
};

MongoDB.prototype.putUser = function(email, data, callback) {
    var newData = {};
    util._extend(newData, data);
    
    newData._id = data.uid;
    newData.email = email;
    
    dbQueue(function(){
        db.collection('users').updateOne({email: email}, newData, {upsert: true, w: 1}, callback);
    });
};

MongoDB.prototype.getUser = function(email, callback){
	var User = require('./user');

    dbQueue(function(){
        db.collection('users').findOne({email: email}, {_id: 0}, function(err, data) {
    		if (err) {
                callback(err);
                return;
            }
            
            if (!data) {
                callback('UserNotFound');
                return;
            }
            
    		var user = new User();
    		
    		user.login(email, data, function(){
    
    			callback(null, user);
    		});
    	});
    });
};

MongoDB.prototype.deleteUser = function(email, callback) {
    var that = this;
    
    dbQueue(function(){
    	that.getUser(email, function(err, user){
    		if (err){ if (callback) callback(err); return; }
    		
    		db.collection('users').remove({email: email}, function(error, data){
    		    callback(error || null, error ? false : true);
    		});
    	});
    });
};

MongoDB.prototype.getUserByUid = function(uid, opts, callback) {
    var User = require('./user');

    if (typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    if (typeof uid === 'string') {
        uid = parseInt(uid);

        if (isNaN(uid)) {
            callback('UidNotANumber');
            return;
        }
    }

    var isArray = Array.isArray(uid);
    
    if (!Array.isArray(uid))
        uid = [uid];
        
    var out = {};
    var len = 0;

    dbQueue(function(){
        db.collection('users').find({_id: { $in: uid}}, {_id: 0}).toArray(function(err, data) {
            if(err || !data || data.length == 0){
                callback('SomeUsersNotFound', out);
                return;
            }
            
            data.forEach(function(userobj) {
                var user = new User();
                
                user.login(userobj.email, userobj, opts, function(){
                    if (isArray)
                        out[userobj.uid] = user;
                    else
                        out = user;
                        
                    console.log("Initialized user " + user.email);
                    if(++len == data.length){
                        if(uid.length == data.length) callback(null, out);
                        else callback('SomeUsersNotFound', out);
                    }
                });
            });
        });
    });
};

MongoDB.prototype.getUserByName = function(name, opts, callback) {
    var User = require('./user');

    if (typeof opts === 'function') {
        callback = opts;
        opts = {};
    }
    
    dbQueue(function(){
        db.collection('users').findOne({un: name}, {_id: 0}, function(err, userobj) {
            if(err || !userobj){
                if (callback) callback('UserNotFound');
                return;
            }
            
            var user = new User();
    
            user.login(userobj.email, userobj, opts, function() {
                if (callback) callback(null, user);
            });
        });
    });
};

MongoDB.prototype.userEmailExists = function(key, callback) {
    dbQueue(function(){
        db.collection('users').findOne({email: key}, {_id: 0}, function(err, data) {
            if (callback) callback(err, data ? true : false);
        });
    });
};

//ChatDB
MongoDB.prototype.logChat = function(uid, msg, special, callback) {
    dbQueue(function(){
        getNextSequence('chat', 'CIDCOUNTER', function(currentCID) {
            db.collection('chat').insert({_id: currentCID, uid: uid, msg: msg, special: special}, function(error, data) {
    			if (callback) callback(error, currentCID);
    		});
        });
    });
};

//PmDB
MongoDB.prototype.logPM = function(from, to, msg, callback) {
    dbQueue(function(){
        getNextSequence('pms', 'PMIDCOUNTER', function(currentCID) {
            db.collection('pms').insert({_id: currentCID, msg: msg, from: from, to: to, time: new Date(), unread: true }, function(error, data) {
                if (error) log.error("Error logging chat message");
        		if (callback) callback(error, currentCID);
        	});
        });
    });
};

MongoDB.prototype.getConversation = function(from, to, callback) {
    dbQueue(function(){
        db.collection('pms').find({ $or: [ {from: from, to: to}, {from: to, to: from}] }, {_id: 0}).toArray(function(err, data) {
            if(err){
                callback(err);
            } else {
                var out = [];
                for(var key in data){
                    out.push({message:data[key].msg,time:data[key].time,from:data[key].from});
                }
                callback(null, out);
            }
        });
    });
};

MongoDB.prototype.getConversations = function(uid, callback) {
    var that = this;
    
    dbQueue(function(){
        db.collection('pms').find({ $or: [ {from: uid}, {to: uid}] }, {_id: 0}).toArray(function(err, data) {
            if(err){
                callback(err);
            } else {
                var out = {};
                var uids = [];
                for (var key in data) {
                    var otherUid = data[key].to == uid ? data[key].from : data[key].to;
                    
                    if (out[otherUid] === undefined) {
                        uids.push(otherUid);
                        out[otherUid] = {
                            user: null,
                            messages: [],
                            unread: 0
                        };
                    }
                    out[otherUid].messages.push({ message: data[key].msg, time: data[key].time, from: data[key].from });
                    
                    if (data[key].unread && data[key].from != uid)
                        out[otherUid].unread++;
                }
                
                if (uids.length > 0) {
                    that.getUserByUid(uids, function(err, result){
                        if (err) {
                            callback(err);
                        } else {
                            for (var id in result) {
                                if (out[id]) {
                                    out[id].user = result[id].getClientObj();
                                }
                            }
                            callback(null, out);
                        }
                    });
                }
                else {
                    callback(null, out);
                }
            }
        });
    });
};

MongoDB.prototype.markConversationRead = function(uid, uid2, time) {
    dbQueue(function(){
        db.collection('pms').updateMany({to: uid, from: uid2, time: {$lt: new Date(time)}}, {$set: {unread: false}}, function(){});
    });
};

//IpDB
MongoDB.prototype.logIp = function(address, uid) {
    dbQueue(function(){
        db.collection('ip').insert({
            uid: uid,
            address: address,
            time: new Date()
        });
    });
};

MongoDB.prototype.getIpHistory = function(uid, callback) {
     dbQueue(function(){
        db.collection('ip').find({uid: uid}, {_id: 0, uid: 0}).toArray(function(err, data) {
            if(err)
                callback(err);
            else
                callback(null, data.sort(function(a, b){ return a.address > b.address; }).reverse().filter(function(e, i, a){ return i == 0 || a[i - 1].address != e.address; }).sort(function(a, b){ return a.time < b.time; }));
        });
    });
};

module.exports = new MongoDB();
