'use strict';
// Modules
const mongodb = require('mongodb').MongoClient;
const util = require('util');
const log = new(require('basic-logger'))({
    showTimestamp: true,
    prefix: 'MongoDB'
});

// Files
const nconf = require('nconf');
const Mailer = require('./mail/Mailer');
const DBUtils = require('./database_util');

// Variables
const expires = 1000 * 60 * 60 * 24 * nconf.get('loginExpire');
let usernames = [];
let db = null;
let poolqueue = [];
let ready = false;

let playlistscol = null;
let roomcol = null;
let tokenscol = null;
let userscol = null;
let chatcol = null;
let pmscol = null;
let ipcol = null;

function dbQueue(callback) {
    if (callback === true) {
        while (poolqueue.length > 0)
            (poolqueue.shift())();

        ready = true;
        return;
    }

    if (!ready) {
        return poolqueue.push(callback);
    }

    callback();
}

function createCollectionsIfNoExist(callback) {
    var step = 0;
    var total = 7;

    db.collection('playlists', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('playlists', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the playlists collection');

                playlistscol = result;
                if (++step == total) callback();
            });
        } else {
            playlistscol = col;
            if (++step == total) callback();
        }
    });

    db.collection('room', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('room', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the room collection');

                roomcol = result;
                if (++step == total) callback();
            });
        } else {
            roomcol = col;
            if (++step == total) callback();
        }
    });

    db.collection('tokens', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('tokens', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the tokens collection');

                tokenscol = result;
                if (++step == total) callback();
            });
        } else {
            tokenscol = col;
            if (++step == total) callback();
        }
    });

    db.collection('users', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('users', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the users collection');

                userscol = result;
                if (++step == total) callback();
            });
        } else {
            userscol = col;
            if (++step == total) callback();
        }
    });

    db.collection('chat', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('chat', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the chat collection');

                chatcol = result;
                if (++step == total) callback();
            });
        } else {
            chatcol = col;
            if (++step == total) callback();
        }
    });

    db.collection('pms', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('pms', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the pms collection');

                pmscol = result;
                if (++step == total) callback();
            });
        } else {
            pmscol = col;
            if (++step == total) callback();
        }
    });

    db.collection('ip', {
        strict: true
    }, function (err, col) {
        if (err) {
            db.createCollection('ip', function (errc, result) {
                if (errc)
                    throw new Error('Failed to create the ip collection');

                ipcol = result;
                if (++step == total) callback();
            });
        } else {
            ipcol = col;
            if (++step == total) callback();
        }
    });
}

function initCollections(callback) {
    var step = 0;
    var total = 4;

    // Playlists
    playlistscol.findOne({
        _id: 'PIDCOUNTER'
    }, function (err, pidobj) {
        if (err) {
            throw new Error('Cannot get PIDCOUNTER from playlists');
        }

        if (!pidobj) {
            playlistscol.insert({
                _id: 'PIDCOUNTER',
                seq: 1
            }, function (error, data) {
                if (error) {
                    throw new Error('Cannot set PIDCOUNTER to playlists');
                }
                if (++step == total) callback();
            });
        } else {
            if (++step == total) callback();
        }
    });

    // Users
    userscol.findOne({
        _id: 'UIDCOUNTER'
    }, function (err, pidobj) {
        if (err) {
            throw new Error('Cannot get UIDCOUNTER from users');
        }

        if (!pidobj) {
            userscol.insert({
                _id: 'UIDCOUNTER',
                seq: 1
            }, function (error, data) {
                if (error) {
                    throw new Error('Cannot set UIDCOUNTER to users');
                }
                if (++step == total) callback();
            });
        } else {
            if (++step == total) callback();
        }
    });

    // Chat
    chatcol.findOne({
        _id: 'CIDCOUNTER'
    }, function (err, pidobj) {
        if (err) {
            throw new Error('Cannot get CIDCOUNTER from chat');
        }
        if (!pidobj) {
            chatcol.insert({
                _id: 'CIDCOUNTER',
                seq: 1
            }, function (error, data) {
                if (error) {
                    throw new Error('Cannot set CIDCOUNTER to chat');
                }
                if (++step == total) callback();
            });
        } else {
            if (++step == total) callback();
        }
    });

    // PMs
    pmscol.findOne({
        _id: 'PMIDCOUNTER'
    }, function (err, pidobj) {
        if (err) {
            throw new Error('Cannot get PMIDCOUNTER from pms');
        }
        if (!pidobj) {
            pmscol.insert({
                _id: 'PMIDCOUNTER',
                seq: 1
            }, function (error, data) {
                if (error) {
                    throw new Error('Cannot set PMIDCOUNTER to pms');
                }
                if (++step == total) callback();
            });
        } else {
            if (++step == total) callback();
        }
    });
}

function MongoDB(cb) {
    const dburl = `mongodb://${nconf.get('db:mongoUser')}:${nconf.get('db:mongoPassword')}@${nconf.get('db:mongoHost')}:27017/${nconf.get('db:mongoDatabase')}`;

    mongodb.connect(dburl, function (err, database) {
        if (err) {
            throw new Error(`Could not connect to database: ${err}`);
        }

        db = database;

        createCollectionsIfNoExist(() => {
            initCollections(() => {
                dbQueue(true);
            });
        });
    });
}

function getNextSequence(collection, id, callback) {
  dbQueue(() => {
      db.collection(collection).findOneAndUpdate({
          _id: id
      }, {
          $inc: {
              seq: 1
          }
      }, (err, r) => {
          if (err) throw new Error('Cannot update index counter');
          callback(r.value.seq);
      });
  });
}

// PlaylistDB
MongoDB.prototype.getPlaylist = function (pid, callback) {
    var Playlist = require('./playlist');

    dbQueue(function () {
        playlistscol.findOne({
            _id: pid
        }, {
            _id: 0
        }, function (err, data) {
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

MongoDB.prototype.createPlaylist = function (owner, name, callback) {
    var Playlist = require('./playlist');

    dbQueue(function () {
        getNextSequence('playlists', 'PIDCOUNTER', function (currentPID) {
            var pl = new Playlist();

            pl.id = currentPID;
            pl.data.created = Date.now();
            pl.data.owner = owner;
            pl.data.name = name.substr(0, 100);

            var updatedPlObj = pl.makeDbObj();
            updatedPlObj._id = currentPID;

            playlistscol.insert(updatedPlObj, function (error, data) {
                callback(error, pl);
            });
        });
    });
};

MongoDB.prototype.deletePlaylist = function (pid, callback) {
    dbQueue(function () {
        playlistscol.remove({
            _id: pid
        }, callback);
    });
};


MongoDB.prototype.putPlaylist = function (pid, data, callback) {
    var newData = {};
    util._extend(newData, data);

    newData._id = pid;

    dbQueue(function () {
        playlistscol.updateOne({
            _id: pid
        }, newData, {
            upsert: true,
            w: 1
        }, function (error, res) {
            callback(data);
        });
    });
};

// RoomDB
MongoDB.prototype.getRoom = function (slug, callback) {
    dbQueue(function () {
        roomcol.findOne({
            slug
        }, {
            _id: 0
        }, callback);
    });
    return this;
};

MongoDB.prototype.setRoom = function (slug, val, callback) {
    dbQueue(function () {
        var newData = {};
        util._extend(newData, val);

        newData.slug = slug;
        roomcol.updateOne({
            slug
        }, newData, {
            upsert: true,
            w: 1
        }, function (error, data) {
            if (callback) callback(error, data);
        });
    });
    return this;
};

// TokenDB
MongoDB.prototype.deleteToken = function (tok) {
    dbQueue(function () {
        tokenscol.remove({
            tok
        }, function () {});
    });
};

MongoDB.prototype.createToken = function (email) {
    var tok = DBUtils.makePass(email, Date.now());

    dbQueue(function () {
        tokenscol.insert({
            tok,
            email,
            time: Date.now(),
        }, function () {});
    });

    return tok;
};

MongoDB.prototype.isTokenValid = function (tok, callback) {
    var that = this;

    dbQueue(function () {
        tokenscol.findOne({
            tok
        }, function (err, data) {
            if (err || data == null) {
                callback('InvalidToken');
                return;
            }

            if (nconf.get('loginExpire') && (Date.now() - data.time) < expires) {
                callback(null, data.email);
            } else {
                that.deleteToken(data.token);
                callback('InvalidToken');
            }
        });
    });
};

// UserDB
function addUsername(un) {
    usernames.push(un.toLowerCase());
}

function usernameExists(un) {
    un = un.toLowerCase();

    var ind;
    return ((ind = usernames.indexOf(un)) != -1 ? ind : false);
}

MongoDB.prototype.createUser = function (obj, callback) {
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

    // Validation
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

    dbQueue(function () {
        // Check for existing account
        that.userEmailExists(inData.email, function (err, res) {
            if (err) {
                if (callback) callback('AccountExists');
                return;
            }

            getNextSequence('users', 'UIDCOUNTER', function (currentUID) {
                var user = new User();

                user.data.uid = currentUID;
                user.data.un = inData.un;
                user.data.salt = DBUtils.makePass(Date.now()).slice(0, 10);
                user.data.pw = DBUtils.makePass(inData.pw, user.data.salt);
                user.data.created = Date.now();
                if (nconf.get('room:mail:confirmation')) {
                  user.data.confirmation = DBUtils.makePass(Date.now());
                }
                var updatedUserObj = user.makeDbObj();
                updatedUserObj._id = currentUID;
                updatedUserObj.email = inData.email;

                var tok = that.createToken(inData.email);

                userscol.insert(updatedUserObj, function (error, data) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    // Send confirmation email
                    if (nconf.get('room:mail:confirmation')) {
                        Mailer.sendEmail('signup', {
                            code: user.data.confirmation,
                            user: inData.un,
                        }, inData.email, function (data) {
                            console.log(data);
                        });
                    }

                    // Do other ~messy~ stuff
                    addUsername(inData.un);
                    user.login(inData.email);
                    callback(null, user, tok);
                });
            });
        });
    });
};

MongoDB.prototype.loginUser = function (obj, callback) {
    var User = require('./user');
    var that = this;

    var defaultLoginObj = {
        email: null,
        pw: null,
        token: null,
    };
    util._extend(defaultLoginObj, obj);

    var inData = defaultLoginObj;

    dbQueue(function () {
        if (inData.email && inData.pw) {
            inData.email = inData.email.toLowerCase();

            userscol.findOne({
                email: inData.email
            }, {
                _id: 0
            }, function (err, data) {
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

                user.login(inData.email, data, function () {
                    callback(null, user, tok);
                });
            });
        } else if (inData.token) {
            that.isTokenValid(inData.token, function (err, email) {
                if (err) {
                    callback(err);
                    return;
                }

                userscol.findOne({
                    email
                }, {
                    _id: 0
                }, function (err, data) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (!data) {
                        callback('UserNotFound');
                        return;
                    }

                    var user = new User();
                    user.login(email, data, function () {
                        callback(null, user);
                    });
                });
            });
        } else {
            callback('InvalidArgs');
        }
    });
};

MongoDB.prototype.putUser = function (email, data, callback) {
    var newData = {};
    util._extend(newData, data);

    newData._id = data.uid;
    newData.email = email;

    dbQueue(function () {
        userscol.updateOne({
            email
        }, newData, {
            upsert: true,
            w: 1
        }, callback);
    });
};

MongoDB.prototype.getUser = function (email, callback) {
    var User = require('./user');

    dbQueue(function () {
        userscol.findOne({
            email
        }, {
            _id: 0
        }, function (err, data) {
            if (err) {
                callback(err);
                return;
            }

            if (!data) {
                callback('UserNotFound');
                return;
            }

            var user = new User();

            user.login(email, data, function () {
                callback(null, user);
            });
        });
    });
};

MongoDB.prototype.deleteUser = function (email, callback) {
    var that = this;

    dbQueue(function () {
        that.getUser(email, function (err, user) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            userscol.remove({
                email
            }, function (error, data) {
                callback(error || null, error ? false : true);
            });
        });
    });
};

MongoDB.prototype.getUserByUid = function (uid, opts, callback) {
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

    dbQueue(function () {
        userscol.find({
            _id: {
                $in: uid
            }
        }, {
            _id: 0
        }).toArray(function (err, data) {
            if (err || !data || data.length == 0) {
                callback('SomeUsersNotFound', out);
                return;
            }

            data.forEach(function (userobj) {
                var user = new User();

                user.login(userobj.email, userobj, opts, function () {
                    if (isArray)
                        out[userobj.uid] = user;
                    else
                        out = user;

                    console.log('Initialized user ' + user.email);
                    if (++len == data.length) {
                        if (uid.length == data.length) callback(null, out);
                        else callback('SomeUsersNotFound', out);
                    }
                });
            });
        });
    });
};

MongoDB.prototype.getUserByName = function (name, opts, callback) {
    var User = require('./user');

    if (typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    dbQueue(function () {
        userscol.findOne({
            un: name
        }, {
            _id: 0
        }, function (err, userobj) {
            if (err || !userobj) {
                if (callback) callback('UserNotFound');
                return;
            }

            var user = new User();

            user.login(userobj.email, userobj, opts, function () {
                if (callback) callback(null, user);
            });
        });
    });
};

MongoDB.prototype.userEmailExists = function (key, callback) {
    dbQueue(function () {
        userscol.findOne({
            email: key
        }, {
            _id: 0
        }, function (err, data) {
            if (callback) callback(err, data ? true : false);
        });
    });
};

// ChatDB
MongoDB.prototype.logChat = function (uid, msg, special, callback) {
    dbQueue(function () {
        getNextSequence('chat', 'CIDCOUNTER', function (currentCID) {
            chatcol.insert({
                _id: currentCID,
                uid,
                msg,
                special
            }, function (error, data) {
                if (callback) callback(error, currentCID);
            });
        });
    });
};

// PmDB
MongoDB.prototype.logPM = function (from, to, msg, callback) {
    dbQueue(function () {
        getNextSequence('pms', 'PMIDCOUNTER', function (currentCID) {
            pmscol.insert({
                _id: currentCID,
                msg,
                from,
                to,
                time: new Date(),
                unread: true
            }, function (error, data) {
                if (error) log.error('Error logging chat message');
                if (callback) callback(error, currentCID);
            });
        });
    });
};

MongoDB.prototype.getConversation = function (from, to, callback) {
    dbQueue(function () {
        pmscol.find({
            $or: [{
                from,
                to
            }, {
                from: to,
                to: from
            }]
        }, {
            _id: 0
        }).toArray(function (err, data) {
            if (err) {
                callback(err);
            } else {
                var out = [];
                for (var key in data) {
                    out.push({
                        message: data[key].msg,
                        time: data[key].time,
                        from: data[key].from
                    });
                }
                callback(null, out);
            }
        });
    });
};

MongoDB.prototype.getConversations = function (uid, callback) {
    var that = this;

    dbQueue(function () {
        pmscol.find({
            $or: [{
                from: uid
            }, {
                to: uid
            }]
        }, {
            _id: 0
        }).toArray(function (err, data) {
            if (err) {
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
                    out[otherUid].messages.push({
                        message: data[key].msg,
                        time: data[key].time,
                        from: data[key].from
                    });

                    if (data[key].unread && data[key].from != uid)
                        out[otherUid].unread++;
                }

                if (uids.length > 0) {
                    that.getUserByUid(uids, function (err, result) {
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
                } else {
                    callback(null, out);
                }
            }
        });
    });
};

MongoDB.prototype.markConversationRead = function (uid, uid2, time) {
    dbQueue(function () {
        pmscol.updateMany({
            to: uid,
            from: uid2,
            time: {
                $lt: new Date(time)
            }
        }, {
            $set: {
                unread: false
            }
        }, function () {});
    });
};

// IpDB
MongoDB.prototype.logIp = function (address, uid) {
    dbQueue(function () {
        ipcol.insert({
            uid,
            address,
            time: new Date()
        });
    });
};

MongoDB.prototype.getIpHistory = function (uid, callback) {
    dbQueue(function () {
        ipcol.find({
            uid
        }, {
            _id: 0,
            uid: 0
        }).toArray(function (err, data) {
            if (err)
                callback(err);
            else
                callback(null, data.sort(function (a, b) {
                    return a.address > b.address;
                }).reverse().filter(function (e, i, a) {
                    return i == 0 || a[i - 1].address != e.address;
                }).sort(function (a, b) {
                    return a.time < b.time;
                }));
        });
    });
};

module.exports = new MongoDB();
