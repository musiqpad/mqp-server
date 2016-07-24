const jwt = require("jsonwebtoken");

module.exports = {
	createToken(payload, secret, expires) {
		return jwt.sign(payload, secret, {
			expiresIn: expires
		});
	},
	verify: jwt.verify,
	decode: jwt.decode,
}