//Modules
var mysql = require('mysql');
var util = require('util');
var _ = require('underscore');
var log = new(require('basic-logger'))({
    showTimestamp: true,
    prefix: "MysqlDB"
});

//Files
var config = require('../serverconfig.js');
var Hash = require('./hash');
var Mailer = require('./mailer');
var DBUtils = require('./database_util');

var db = null;
var pool = null;

var MysqlDB = function(){
	var that = this;
	var mysqlConfig = { 
		host: config.db.mysqlHost,
		user: config.db.mysqlUser,
		password: config.db.mysqlPassword,
		database: config.db.mysqlDatabase,
		charset: "UTF8_GENERAL_CI",
		multipleStatements: true,
	};
	
	if (!db){
		pool = mysql.createPool(mysqlConfig);
		db = mysql.createConnection(mysqlConfig);
		
		db.connect(function(err) {
			if(err) {
				log.error(err);
			} else {
				that.execute("\
					CREATE TABLE IF NOT EXISTS `users` (\
					    `id` INTEGER UNSIGNED NULL AUTO_INCREMENT DEFAULT NULL,\
					    `email` VARCHAR(254) UNIQUE NOT NULL DEFAULT 'NULL',\
					    `un` VARCHAR(20) UNIQUE NOT NULL DEFAULT 'NULL',\
					    `pw` VARCHAR(32) NOT NULL DEFAULT 'NULL',\
					    `salt` VARCHAR(10),\
					    `activepl` INTEGER UNSIGNED NULL DEFAULT NULL,\
				        `created` DATETIME NULL,\
					    `confirmation` CHAR(32) NULL DEFAULT NULL COMMENT 'Hash for account confirmation',\
					    `badge_top` VARCHAR(7) NULL DEFAULT '#000000',\
					    `badge_bottom` VARCHAR(7) NULL DEFAULT '#000000',\
					    `recovery` VARCHAR(32) NULL DEFAULT NULL,\
					    `recovery_timeout` DATETIME NULL,\
					    `uptime` BIGINT UNSIGNED NULL DEFAULT NULL,\
					    `lastdj` TINYINT(1) NOT NULL DEFAULT 0,\
					    PRIMARY KEY (`id`)\
					);\
					\
					CREATE TABLE IF NOT EXISTS `playlists` (\
					    `id` INTEGER UNSIGNED NULL AUTO_INCREMENT DEFAULT NULL,\
					    `owner` INTEGER UNSIGNED NULL DEFAULT NULL,\
					    `owner_old` INTEGER UNSIGNED NULL DEFAULT NULL,\
					    `name` VARCHAR(32) NOT NULL DEFAULT 'NULL',\
					    `created` DATETIME NOT NULL,\
					    PRIMARY KEY (`id`)\
					);\
					\
					CREATE TABLE IF NOT EXISTS `media` (\
					    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,\
					    `pid` INTEGER UNSIGNED NULL DEFAULT NULL,\
					    `title` VARCHAR(100) NULL DEFAULT NULL,\
					    `type` TINYINT UNSIGNED NULL DEFAULT NULL,\
					    `cid` VARCHAR(32) NOT NULL DEFAULT 'NULL',\
					    `duration` MEDIUMINT UNSIGNED NULL DEFAULT NULL,\
					    `sort` TINYINT UNSIGNED NULL DEFAULT NULL,\
					    PRIMARY KEY (`id`)\
					);\
					\
					CREATE TABLE IF NOT EXISTS `history` (\
					    `slug` VARCHAR(32) NOT NULL,\
                        `dj` int(10) unsigned DEFAULT NULL,\
                        `cid` varchar(32) DEFAULT NULL,\
                        `start` DATETIME NOT NULL,\
                        `duration` int(10) unsigned NOT NULL,\
                        `title` varchar(100) NOT NULL,\
                        `like` int(10) unsigned NOT NULL DEFAULT '0',\
                        `grab` int(10) unsigned NOT NULL DEFAULT '0',\
                        `dislike` int(10) unsigned NOT NULL DEFAULT '0'\
                    );\
					\
					CREATE TABLE IF NOT EXISTS `chat` (\
					    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT DEFAULT NULL,\
					    `msg` VARCHAR(256) NOT NULL DEFAULT 'NULL',\
					    `uid` INTEGER UNSIGNED NULL DEFAULT NULL,\
					    PRIMARY KEY (`id`)\
					);\
					\
					CREATE TABLE IF NOT EXISTS `tokens` (\
						`email` VARCHAR(254) NOT NULL,\
						`token` VARCHAR(32) NOT NULL,\
						`created` DATETIME NOT NULL,\
						PRIMARY KEY (`email`)\
					);\
					\
					CREATE TABLE IF NOT EXISTS `roles` (\
                        `slug` VARCHAR(64) NOT NULL,\
                        `uid` INT(10) unsigned NOT NULL,\
                        `role` VARCHAR(32) NOT NULL\
                    );\
                    \
                    CREATE TABLE IF NOT EXISTS `bans` (\
                        `slug` VARCHAR(32),\
                        `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT DEFAULT NULL,\
                        `uid` INT(11) NOT NULL,\
                        `uid_by` INT(11) NOT NULL,\
                        `reason` VARCHAR(256) NULL,\
                        `start` DATETIME,\
                        `end` DATETIME,\
                        PRIMARY KEY (`id`)\
                    );\
                    \
					UPDATE `users` SET `lastdj` = false;\
				", null, function(err, res){
					if(err) throw new Error(err);
				});
			}
		});
		
		db.on('error', function(err) {
			// Log
			if(err.code === 'PROTOCOL_CONNECTION_LOST') {
				log.error("Connection to database lot, retrying...");
				//TODO: Reconnect to database
			} else {
				throw err;
			}
		});
	}
}

MysqlDB.prototype.execute = function(query, vars, callback) {
	callback = callback || function(){};
	
	pool.getConnection(function(err, con){
		if (err){
			callback(err);
			return;
		}
		
		con.query(query, vars, function(err, rows){
			callback(err, rows);
			con.release();
		});
	});
};

//PlaylistDB
MysqlDB.prototype.getPlaylist = function(pid, callback) {
    var that = this;
    
    var Playlist = require('./playlist');

    that.execute("SELECT `name`, `created`, `owner` FROM `playlists` WHERE ?", { id: pid, }, function(err, data) {
        if(err || data.length == 0){
        	callback('PlaylistNotFound');
        	return;
        }

        var pl = new Playlist();
        pl.id = pid;
        util._extend(pl.data, data[0]);

        that.execute("SELECT `cid` FROM `media` WHERE ? ORDER BY `sort` ASC;", { pid: pid, }, function(err, data){
            data = data.map(function(e){ return e.cid; });
        	pl.data.content = data;
        	callback(null, pl);
        });
    });

    return this;
};

MysqlDB.prototype.createPlaylist = function(owner, name, callback) {
	name = name.substr(0, 100);
	
    var Playlist = require('./playlist');
    var pl = new Playlist();
    pl.data.owner = owner;
    pl.data.created = new Date();
    pl.data.name = name;
    
	this.execute("INSERT INTO `playlists` SET ?;", { owner: owner, name: name, created: pl.data.created, }, function(err, res){
		if(err) { callback(err); return; }
		
		pl.id = res.insertId;
		
	    callback(null, pl);
	});
};

MysqlDB.prototype.deletePlaylist = function(pid, callback) {
    this.execute("UPDATE `playlists` SET `owner_old` = `owner`, `owner` = NULL WHERE `id` = ?;", [pid], callback);
};

MysqlDB.prototype.putPlaylist = function(pid, data, callback) {
    var that = this;
    
	var toSave = [];
	
	//TODO: Content type support
	
	for(var ind in data.content){
		toSave.push([ pid, data.content[ind], ind ]);
	}
	
	this.execute("UPDATE `playlists` SET ? WHERE ?;", [{ name: data.name, }, { id: pid, }], function(err, data) {
	    if(err){ callback(err); return; }
	    
	    that.execute("DELETE FROM `media` WHERE ?; INSERT INTO `media`(??) VALUES ?;", [{ pid: pid, }, [ 'pid', 'cid', 'sort' ], toSave], function(err, data) {
            if(err){ callback(err); return; }
            
            callback(null, data);
        });
	});
};

//RoomDB
MysqlDB.prototype.getRoom = function(slug, callback) {
    var that = this;
    
    var out = {
        roles: {},
        bans: {},
        history: [],
    }
    
    this.execute("SELECT `role`, `uid` FROM `roles` WHERE ?;", { slug: slug, }, function(err, res) {
        if(err) { callback(err); return; }
       
        for(var ind in res){
            out.roles[res[ind].role] = out.roles[res[ind].role] || [];
            out.roles[res[ind].role].push(res[ind].uid);
        }
       
        that.execute("SELECT `uid`, `uid_by`, `reason`, UNIX_TIMESTAMP(`start`), UNIX_TIMESTAMP(`end`), (SELECT `role` FROM `roles` WHERE `roles`.`uid` = `bans`.`uid_by` AND ?) as `role` FROM `bans` WHERE ?;", [ { slug: slug, }, { slug: slug, } ], function(err, res) {
            if(err) { callback(err); return; }
            
            for(var ind in res){
                var obj = res[ind];
                out.bans[obj.uid] = {
                    uid: obj.uid,
                    start: obj.start * 1000,
                    end: obj.end * 1000,
                    reason: obj.reason,
                    bannedBy: {
                        uid: obj.uid_by,
                        role: obj.role,
                    }
                }
            }
            
            that.execute("\
            SELECT\
                `history`.`cid`, UNIX_TIMESTAMP(`history`.`start`) as `start`, `history`.`title`, `history`.`duration`, `history`.`like`, `history`.`grab`, `history`.`dislike`,\
                `users`.`badge_top`, `users`.`badge_bottom`, IFNULL((SELECT `role` FROM `roles` WHERE `roles`.`uid` = `users`.`id` AND ?), 'default') as `role`, `users`.`un`, `users`.`id`\
            FROM\
                `history`\
            LEFT OUTER JOIN\
                    `users`\
                ON\
                    `users`.`id` = `history`.`dj`\
            WHERE\
                ?\
            ORDER BY `start` ASC;\
            ", [{ slug: slug, }, { slug: slug, }], function(err, res) {
                if(err) { callback(err); return; }

                for(var ind in res){
                    var obj = res[ind];
                    out.history.push({
                        votes:{
                            like: obj.like,
                            grab: obj.grab,
                            dislike: obj.dislike,
                         },
                         song:{
                            cid: obj.cid,
                            title: obj.title,
                            duration: obj.duration,
                         },
                         user:{
                            badge:{
                               top: obj.badge_top,
                               bottom: obj.badge_bottom,
                            },
                            role: obj.role,
                            un: obj.un,
                            uid: obj.id,
                         },
                         start: obj.start * 1000,
                    });
                }

                callback(null, out);
            });
        });
    });
    return this;
};

MysqlDB.prototype.setRoom = function(slug, val, callback) {
    var that = this;

    var outRoles = [], outBans = [], outHistory = [];
    
    for(var key in val.roles){
        for(var ind in val.roles[key])
            outRoles.push([ slug, val.roles[key][ind], key ]);
    }
    for(var key in val.bans){
        var obj = val.bans[key];
        outBans.push([ slug, key, obj.bannedBy.uid, obj.reason, new Date(obj.start), new Date(obj.end) ]);
    }
    for(var ind in val.history){
        var obj = val.history[ind];
        outHistory.push([ slug, obj.user.uid, obj.song.cid, new Date(obj.start), obj.song.duration, obj.song.title, obj.votes.like, obj.votes.grab, obj.votes.dislike ]);
    }
    
    var query = "DELETE FROM `roles` WHERE ?; DELETE FROM `bans` WHERE ?;DELETE FROM `history` WHERE ?;";
    var params = [{ slug: slug, }, { slug: slug, }, { slug: slug, }];
    
    if(outRoles.length){
        query += "INSERT INTO `roles`(??) VALUES ?;";
        params.push([ 'slug', 'uid', 'role' ], outRoles);
    }
    if(outBans.length){
        query += "INSERT INTO `bans`(??) VALUES ?;";
        params.push([ 'slug', 'uid', 'uid_by', 'reason', 'start', 'end' ], outBans);
    }
    if(outHistory.length){
        query += "INSERT INTO `history`(??) VALUES ?;";
        params.push([ 'slug', 'dj', 'cid', 'start', 'duration', 'title', 'like', 'grab', 'dislike' ], outHistory);
    }
    
    that.execute(query, params, callback);
    
    return that;
};

//TokenDB
MysqlDB.prototype.deleteToken = function(tok) {
    this.execute("DELETE FROM `tokens` WHERE ?;", { token: tok, });
};

MysqlDB.prototype.createToken = function(email) {
    var tok = DBUtils.makePass(email, Date.now());

    this.execute("DELETE FROM `tokens` WHERE ?; INSERT INTO `tokens` SET ?, `created` = FROM_UNIXTIME(?);", [ { email: email, }, { token: tok, email: email, }, Date.now() / 1000]);

    return tok;
};

MysqlDB.prototype.isTokenValid = function(tok, callback) {
    this.execute("SELECT `token`, `email` FROM `tokens` WHERE ? AND DATEDIFF(NOW(), `created`) < ?;", [{ token: tok, }, config.loginExpire || 365], function(err, res) {
        if (err || res.length == 0) {
            callback('InvalidToken');
            return;
        }
        
        callback(null, res[0].email);
    });
};

//UserDB
MysqlDB.prototype.getUserNoLogin = function(uid, callback){
    var that = this;
    
	var User = require('./user');
	
	this.execute("SELECT `salt`, `lastdj`, `uptime`, `recovery`, UNIX_TIMESTAMP(`recovery_timeout`) as `recovery_timeout`, `confirmation`, `badge_top`, `badge_bottom`, UNIX_TIMESTAMP(`created`) as `created`, `activepl`, `pw`, `un`, `id` FROM `users` WHERE ?", { id: uid, }, function(err, res){
        if (err || res.length == 0) { callback('UserNotFound'); return; }
        
        res = res[0];
        var data = {
            lastdj: res.lastdj ? true : false,
            uptime: res.uptime,
            recovery: {
                code: res.recovery,
                timeout: res.recovery_timeout * 1000,
            },
            confirmation: res.confirmation,
            badge: {
                top: res.badge_top,
                bottom: res.badge_bottom,
            },
            playlists: [],
            created: res.created * 1000,
            activepl: res.activepl,
            pw: res.pw,
            un: res.un,
            uid: res.id,
            salt: res.salt,
        }

        that.execute("SELECT `id` FROM `playlists` WHERE `owner` = ?;", [ uid ], function(err, res) {
            
            for(var ind in res)
                data.playlists.push(res[ind].id);
                
            callback(null, data);
        });
	});
};

MysqlDB.prototype.usernameExists = function(name, callback){
    this.execute("SELECT EXISTS(SELECT * FROM `users` WHERE ?) as `exists`;", { un: name, }, function(err, res){
        if(err) callback(err);
        else callback(null, res[0].exists == 1);
    });
};

MysqlDB.prototype.createUser = function(obj, callback) {
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
    if (!inData.pw || inData.pw == 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
        callback('PasswordBlank');
        return;
    }
    
    //Check for existing username
    this.usernameExists(inData.un, function(err, res){
        if(err || res) callback('UsernameExists');
        else {
            //Check for existing account
            that.userEmailExists(inData.email, function(err, res) {
                if (res) {
                    if (callback) callback('AccountExists');
                    return;
                }
        
                var user = new User();
        
                user.data.un = inData.un;
                user.data.salt = DBUtils.makePass(Date.now()).slice(0, 10);
                user.data.pw = DBUtils.makePass(inData.pw, user.data.salt);
                user.data.created = Date.now();
                if (config.room.email.confirmation) user.data.confirmation = DBUtils.makePass(Date.now());
                var updatedUserObj = user.makeDbObj();
        
                var tok = that.createToken(inData.email);
                
                delete updatedUserObj.uid;
        
                that.putUser(inData.email, updatedUserObj, function(err, id) {
                    if (err) {
                        callback(err);
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
                    
                    //Login user
                    user.data.uid = id;
                    user.login(inData.email);
                    callback(null, user, tok);
                });
            });
        }
    });
};

MysqlDB.prototype.loginUser = function(obj, callback) {
    var User = require('./user');
    var that = this;

    var defaultLoginObj = {
        email: null,
        pw: null,
        token: null,
    };
    util._extend(defaultLoginObj, obj);
    var inData = defaultLoginObj;

    if (inData.email && inData.pw) {
        inData.email = inData.email.toLowerCase();
        that.execute("SELECT `id` FROM `users` WHERE ?;", { email: inData.email, }, function(err, res) {
            if(err || res.length == 0) callback("UserNotFound");
            else {
                that.getUserNoLogin(res[0].id, function(err, data) {
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
            }
        });
    } else if (inData.token) {
        that.isTokenValid(inData.token, function(err, email) {
            if (err) {
                callback(err);
                return;
            }

            that.execute("SELECT `id` FROM `users` WHERE ?;", { email: email, }, function(err, res) {
                if(err || res.length == 0) callback("UserNotFound");
                else {
                    that.getUserNoLogin(res[0].id, function(err, data) {
                        var user = new User();

                        user.login(email, data, function() {
                            
                            callback(null, user);
                        });
                    });
                }
            });
        });
    } else {
        callback('InvalidArgs');
    }
};

MysqlDB.prototype.putUser = function(email, data, callback) {
    callback = callback || function(){};
    
    var newData = {};
    util._extend(newData, data);
    
    newData.badge_bottom = newData.badge.bottom;
    newData.badge_top = newData.badge.top;
    newData.recovery_timeout = new Date(newData.recovery.timeout);
    newData.recovery = newData.recovery.code;
    newData.email = email;
    newData.created = new Date(newData.created);
    newData.id = newData.uid;
    delete newData.uid;
    delete newData.badge;
    delete newData.playlists;
    this.execute("INSERT INTO `users`(??) VALUES(?) ON DUPLICATE KEY UPDATE ?;", [ Object.keys(newData), _.values(newData), newData ], function(err, res) {
        if(res.insertId) callback(null, res.insertId);
        else callback(err, res);
    });
};

MysqlDB.prototype.getUser = function(email, callback){
    var that = this;
    
    var User = require('./user');
    
    this.execute("SELECT `id` FROM `users` WHERE ?;", { email: email, }, function(err, res) {
        if(err || res.length == 0){
            callback('UserNotFound');
        } else {
            that.getUserNoLogin(res[0].id, function(err, data){
                if(err || data.length == 0) {
                    callback('UserNotFound');
                } else {
                    var user = new User();

                    user.login(email, data, function(){

            		    callback(null, user);
        		    }); 
                }
            });
        }
    });
};

MysqlDB.prototype.deleteUser = function(email, callback){
	this.execute("DELETE FROM `users` WHERE ?;", { email: email, }, callback);
};

MysqlDB.prototype.getUserByUid = function(uid, opts, callback) {
    var that = this;
    
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
    
    var User = require('./user');
    
    if(Array.isArray(uid)){
        var out = {};
        var initialized = 0;

        that.execute("SELECT `id`, `email` FROM `users` WHERE `id` IN (?);", [ uid ], function(err, res) {
            if(err || res.length == 0){
                callback('SomeUsersNotFound', out);
            }
            
            res.forEach(function(e){
               that.getUserNoLogin(e.id, function(err, data) {
                    var user = new User();

                    user.login(e.email, data, opts, function(){
                        out[e.id] = user;
                        console.log("Initialized user " + e.email);
                        if(++initialized == res.length){
                            if(uid.length == res.length) callback(null, out);
                            else callback('SomeUsersNotFound', out);
                        }
                    });
                }); 
            });
        })
    } else {
        that.getUserNoLogin(uid, function(err, data){
            if(err) callback('UserNotFound');
            else {
                that.execute("SELECT `email` FROM `users` WHERE ?;", { id: uid, }, function(err, res) {
                    var user = new User();
                    user.login(res[0].email, data, opts, callback);
                });
            }
        })
    }
};

MysqlDB.prototype.getUserByName = function(name, opts, callback) {
    var that = this;
    
    var User = require('./user');

    if (typeof opts === 'function') {
        callback = opts;
        opts = {};
    }
    
    this.execute("SELECT `id`, `email` FROM `users` WHERE ?;", { username: name, }, function(err, res){
       if(err || res.length == 0) callback('UserNotFound');
       else {
           that.getUserNoLogin(res[0].id, function(err, data) {
              var user = new User();
              user.login(res[0].email, data, opts, callback);
           });
       }
    });
};

MysqlDB.prototype.userEmailExists = function(key, callback) {
    this.execute("SELECT EXISTS (SELECT * FROM `users` WHERE ?) as `exists`;", { email: key, }, function(err, res){
        if(err) callback(err);
        else callback(null, res[0].exists == 1);
    })
};

module.exports = new MysqlDB;