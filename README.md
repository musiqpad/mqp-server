# mqp-server [![Version npm](https://img.shields.io/npm/v/mqp-server.svg?style=flat-square)](https://www.npmjs.com/package/mqp-server) [![npm Downloads](https://img.shields.io/npm/dm/mqp-server.svg?style=flat-square)](https://www.npmjs.com/package/mqp-server) [![Build Status](https://img.shields.io/travis/musiqpad/mqp-server/master.svg?style=flat-square)](https://travis-ci.org/musiqpad/mqp-server) [![devDependency Status](https://david-dm.org/musiqpad/mqp-server/dev-status.svg?style=flat-square)](https://david-dm.org/musiqpad/mqp-server#info=devDependencies)

[![NPM](https://nodei.co/npm/mqp-server.png)](https://npmjs.org/package/mqp-server)

## About

The base for creating a self-hosted pad.

- [musiqpad.com](https://musiqpad.com)
- [Latest Release](https://github.com/musiqpad/mqp-server/releases/latest)
- [Discord](https://mqp.io/discord)
- [Feedback / Issues](https://mqp.io/feedback)

## Quick Start Install

1. Make sure you have installed [NodeJS](https://nodejs.org/en/download/) on the hosting computer with version 4.0.0 or later.
2. Download the [latest stable version](https://github.com/musiqpad/mqp-server/releases/latest)
3. Unzip it in the location you want to install
4. Open a terminal and `npm install --production` it
5. Start the server by running `npm start`
6. If everything went well, there should be no error messages!

To change the settings, edit the config.hjson file!

If you want to start musiqpad using an application manager like forever, start the app.js file. To see server logs, run `npm run log` You can also download the latest pre-release [here](https://github.com/musiqpad/mqp-server/releases) (rc = release candidate, exp = experimental)

## Deploying musiqpad using NPM

1. Make sure you have installed NodeJS on the hosting computer with version 4.0.0 or later.
2. Run `npm install mqp-server` in your chosen directory.
3. Copy the `serverconfig.example.js` to create the file `serverconfig.js` and make sure this is located in the root musiqpad folder.
4. Create a javascript file in your directory called 'start.js' and inside the file put:

  ```javascript
  var mqpServer = require('mqp-server');

  var server = new mqpServer();

  server.start();
  ```

5. Start the server by running `node start.js`.

6. If everything went well, there should be no error messages.

### mqpServer.start(params)

Params:

```javascript
{
    forever: {
        enabled: false,
        options: {
            root: './logs',
            pidPath: './pids',
            sockPath: './sock',
            debug: false,
            stream: false
        }
    },
    config: fs.readFileSync('config.hjson'), // example config: config.example.hjson
}
```

## API

Please Refer to the [API Documentation](https://musiqpad.com/api/) for the Events, Actions and Data API's.

### Support

Please email [support@musiqpad.com](mailto:support@musiqpad.com) if you have any questions or queries.
