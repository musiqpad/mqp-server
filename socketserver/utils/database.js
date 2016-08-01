const Hash = require('./hash');
const crypto = require("crypto");

const DBUtils = {
	validateEmail(email) {
		return /^.+@.+\..+$/.test(email);
	},

	validateUsername(un) {
		return /^[a-z0-9_-]{3,20}$/i.test(un);
	},

	makePassMD5(inPass, salt) {
		return Hash.md5(('' + inPass) + (salt || '')).toString();
	},

	randomBytes(bytes, format) {
		return crypto.randomBytes(bytes).toString(format);
	}
};

module.exports = DBUtils;
