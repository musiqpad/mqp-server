'use strict';
const express = require('express');
const compression = require('compression');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const nconf = require('nconf');
const ejs = require('ejs');

const app = express();
let server2 = null;
let server = null;
// eslint-disable-next-line
let socketServer = null;

/* SSL */
if (nconf.get('useSSL') && nconf.get('certificate') && nconf.get('certificate:key') && nconf.get('certificate:cert')) {
	const certificate = {
		key: fs.readFileSync(nconf.get('certificate:key')),
		cert: fs.readFileSync(nconf.get('certificate:cert')),
	};

	server = https.createServer(certificate, app);
	if (nconf.get('webServer:redirectHTTP') && nconf.get('webServer:redirectPort') !== '') {
		server2 = http.createServer(app);
	}
} else {
	server = http.createServer(app);
}

if (nconf.get('webServer:redirectHTTP')) {
	app.use((req, res, next) => {
		if (!req.secure) {
			return res.redirect(['https://', req.hostname, ':', nconf.get('webServer:port') || process.env.PORT, req.url].join(''));
		}
		next();
	});
}

app.set('view engine', 'html');
app.set('views', `${__dirname}/public`);
app.engine('html', ejs.renderFile);
app.use(compression());

app.get(['/', '/index.html'], (req, res) => {
	res.render('index', {
		tags: nconf.get('room:tags'),
		room: nconf.get('room'),
		scripts: nconf.get('room:scripts'),
	});
});

app.use('/pads', express.static(path.resolve(__dirname, 'public')));
app.use(express.static(path.resolve(__dirname, 'public')));

app.get('/config', (req, res) => {
	res.setHeader('Content-Type', 'application/javascript');
	res.send(fs.readFileSync(`${__dirname}/public/lib/js/webconfig.js`));
});

app.get('/api/room', (req, res) => {
	const roomInfo = {
		slug: nconf.get('room:slug'),
		name: nconf.get('room:name'),
		people: null,
		queue: null,
		media: null,
	};
	res.send(roomInfo);
});

server.listen(nconf.get('webServer:port') || process.env.PORT, nconf.get('webServer:address') || process.env.IP, () => {
	const addr = server.address();
	console.log('Webserver listening at', `${addr.address}:${addr.port}`);
});

if (server2 != null) {
	server2.listen(nconf.get('webServer:redirectPort') || 80, nconf.get('webServer:address') || process.env.IP, () => {
		const addr2 = server2.address();
		console.log('HTTP Webserver listening at', `${addr2.address}:${addr2.port}`);
	});
}

const setSocketServer = ss => {
	socketServer = ss;
};

module.exports = {
	app,
	server,
	server2,
	setSocketServer,
};
