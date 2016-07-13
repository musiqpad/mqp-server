const nodemailer = require('nodemailer');
const xoauth2 = require('xoauth2');
const fs = require('fs-extra');
const nconf = require('nconf');
const ejs = require('ejs');

var Mailer = function () {
	const options = nconf.get('room:mail:options');
  var _this = this;
  _this.test = 1;
	if (nconf.get('room:allowrecovery') || nconf.get('room:mail:confirmation')) {
    switch (nconf.get('room:mail:transport')) {
      case 'smtp': {
        _this.transporter = nodemailer.createTransport(options);
        break;
      }
      case 'xoauth': {
        const xoauth = xoauth2.createXOAuth2Generator({
            user: options.auth.xoauth.user,
            clientId: options.auth.xoauth.clientId,
            clientSecret: options.auth.xoauth.clientSecret,
            refreshToken: options.auth.xoauth.refreshToken,
            accessToken: options.auth.xoauth.accessToken
        });
        options.auth.xoauth = xoauth;
        _this.transporter = nodemailer.createTransport(options);
        break;
      }
      case 'direct': {
        const domain = nconf.get('room:mail:sender').split('@')[1];
        options.name = domain;
        _this.transporter = nodemailer.createTransport(options);
        break;
      }
    }
	}
}

Mailer.prototype.sendEmail = function (type, opts, receiver, callback) {
	const html = ejs.render(fs.readFileSync(`socketserver/mail/templates/${type}.html`, 'utf8'), {
		opts,
		room: nconf.get('room'),
	});

	switch(type) {
		case 'signup':
			type.subject = 'Welcome to musiqpad!';
			break;
		case 'recovery':
			type.subject = 'Password recovery';
			break;
	}

	const emailObj = {
		from: nconf.get('room:mail:sender'),
		to: receiver,
		subject: type.subject,
		html,
	};

	this.transporter.sendMail(emailObj, (error, response) => {
		if (error) callback(error);
		else callback(null, response);
	});
};

module.exports = new Mailer();
