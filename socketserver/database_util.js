var Hash = require('./hash');

function DBUtils(){}

DBUtils.prototype.makePass = function(inPass, salt) {
    return Hash.md5(('' + inPass) + (salt || '')).toString();
};

DBUtils.prototype.validateEmail = function(email) {
    return /^.+@.+\..+$/.test(email);
};

DBUtils.prototype.validateUsername = function(un) {
    return /^[a-z0-9_-]{3,20}$/i.test(un);
};

module.exports = new DBUtils();