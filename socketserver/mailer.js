var NM = require('nodemailer');
var util = require('util');
var config = require('../serverconfig');
var xoauth2 = require('xoauth2');
var fs = require('fs');

function Mailer(){
	//Check if we need to authorize against email server
	if(config.room.allowrecovery || config.room.email.confirmation){
		var opts = config.room.email.options;
		this.trans = NM.createTransport(((opts || {}).auth || {}).xoauth2 ? util._extend(opts, {
			auth: {
				xoauth2: xoauth2.createXOAuth2Generator(opts.auth.xoauth2),
			},
		}) : opts)
	}
}

Mailer.prototype.sendEmail = function(type, opts, receiver, callback){
	this.trans.sendMail(this.makeEmailObj(type, receiver, opts), function(error, info){
	    if(error) callback(error);
	    else callback(null, info);
	});
};

Mailer.prototype.makeEmailObj = function(type, receiver, opts){
	//Get email type
	type = this.getType(type);
	
	//Replace all variables
	type.body = type.body.replace(/%%[A-Z]+%%/g, function(k){ return opts[k.slice(2, -2).toLowerCase()] || k; });
	
	//Return email options
	return {
	    from: config.room.email.sender,
	    to: receiver,
	    subject: type.subject,
	    html: type.body,
	};
};

Mailer.prototype.getType = function(type){
	var returnObj = {
		body: fs.readFileSync('socketserver/templates/' + type + '.html', 'utf8'),
	};
	
	switch(type){
		case 'signup':
			returnObj.subject = 'Welcome to musiqpad!';
			break;
		case 'recovery':
			returnObj.subject = 'Password recovery';
			break;
	}
	
	return returnObj;
}

module.exports = new Mailer();