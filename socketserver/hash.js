function md5(str){
	var crypto = require('crypto');
	
	var hash = crypto.createHash('md5');
	hash.update(str);
	return hash.digest('hex');
}

module.exports.md5 = md5;