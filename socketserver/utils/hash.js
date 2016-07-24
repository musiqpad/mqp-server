const crypto = require('crypto');
const bcrypt = require('bcrypt-nodejs');

module.exports = {
	md5(str) {
		const hash = crypto.createHash('md5');
		hash.update(str);
		return hash.digest('hex');
	},
	isMD5(hash) {
		return (/[a-fA-F0-9]{32}/).test(hash);
	},
	bcrypt(str) {
		const salt = bcrypt.genSaltSync(12);
		return bcrypt.hashSync(str, salt);
	},
	compareBcrypt: bcrypt.compareSync,
}