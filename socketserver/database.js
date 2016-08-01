'use strict';
const nconf = require('nconf');
const LevelDB = require('./db_level');
const MySQL = require('./db_mysql');
const MongoDB = require('./db_mongo');
const utils = require('./utils');
let Database;

var util = require('util');

switch (nconf.get('db:dbType')) {
	case 'level':
		Database = LevelDB;
		break;
	case 'mysql':
		Database = MySQL;
		break;
	case 'mongo':
		Database = MongoDB;
		break;
	default:
		Database = LevelDB;
}

function loginCallback(callback) {
	return function (err, user, email) {
		if (email) {
			callback(null, user, utils.token.createToken({ email }, nconf.get('tokenSecret'), nconf.get('loginExpire')));
			return;
		}
		callback(err);
	};
}

class DB extends Database {
	loginUser(obj, callback) {
		if (obj.token) {
			try {
				obj.email = utils.token.verify(obj.token, nconf.get('tokenSecret')).email;
			} catch (e) {
				if (e) {
					callback('InvalidToken');
					return;
				}
			}
		}

		this.getUser(obj.email, (err, user) => {
			if ((err && err.notFound) || user == null) {
				callback('UserNotFound');
				return;
			}

			if (err) {
				callback(err);
				return;
			}
			// If the user has an old md5 password saved in the db
			if (typeof user.data.pw === 'string' && utils.hash.isMD5(user.data.pw) && !obj.token) {
				// And if that md5 password matches with the supplied pw
				if (utils.db.makePassMD5(obj.pw, user.data.salt) !== user.data.pw) {
					callback('IncorrectPassword');
					return;
				}
				// Update the pw to a new bcrypt password
				user.pw = obj.pw;
				super.loginUser(obj.email, loginCallback(callback));
			// If user has an md5 password and only supplied a token
			} else if (utils.hash.isMD5(user.data.pw) && obj.token) {
				// Say token is invalid so we get the password instead of the token next time
				callback('InvalidToken');
			} else if (obj.token) {
				// Check if the token is correct
				utils.token.verify(obj.token, nconf.get('tokenSecret'), (err, decoded) => {
					if (err) {
						callback('InvalidToken');
						return;
					}
					const email = decoded.email;
					super.loginUser(email, loginCallback(callback));
				});
			} else if (obj.pw && utils.hash.compareBcrypt(obj.pw, user.data.pw)) {
				super.loginUser(obj.email, loginCallback(callback));
			} else {
				callback('IncorrectPassword');
			}
		});
	}
	createUser(obj, callback) {
		if (obj.pw) {
			obj.pw = utils.hash.bcrypt(obj.pw);
			super.createUser(obj, loginCallback(callback));
		} else {
			callback('InvalidPassword');
		}
	}
}

const db = new DB();
module.exports = db;
