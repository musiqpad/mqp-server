'use strict';
const nodemailer = require('nodemailer');
const xoauth2 = require('xoauth2');
const fs = require('fs-extra');
const nconf = require('nconf');
const ejs = require('ejs');

class Mailer {
	constructor() {
		const options = nconf.get('room:mail:options');
		const self = this;

		if (nconf.get('room:allowrecovery') || nconf.get('room:mail:confirmation')) {
			switch (nconf.get('room:mail:transport')) {
				case 'smtp': {
					self.transporter = nodemailer.createTransport(options);
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
					self.transporter = nodemailer.createTransport(options);
					break;
				}
				case 'direct': {
					const domain = nconf.get('room:mail:sender').split('@')[1];
					options.name = domain;
					self.transporter = nodemailer.createTransport(options);
					break;
				}
				default: {
					break;
				}
			}
		}
	}

	sendEmail(type, opts, receiver, callback) {
		const html = ejs.render(fs.readFileSync(`socketserver/mail/templates/${type}.html`, 'utf8'), {
			opts,
			room: nconf.get('room'),
		});

		let subject;
		switch (type) {
			case 'signup':
				subject = 'Welcome to musiqpad!';
				break;
			case 'recovery':
				subject = 'Password recovery';
				break;
			default:
				break;
		}

		const emailObj = {
			from: nconf.get('room:mail:sender'),
			to: receiver,
			subject,
			html,
		};

		this.transporter.sendMail(emailObj, (error, response) => {
			if (error) callback(error);
			else callback(null, response);
		});
	}
}

module.exports = new Mailer();
