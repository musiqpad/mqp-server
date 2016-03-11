# mqp-server

## About


The base for creating a self-hosted pad.

## Deploying musiqpad
1. Make sure you have installed NodeJS on the hosting computer with version 4.0.0 or later.
2. Download all the required files. To do so clone the server github repository using your preferred git client or click the "[Download ZIP](https://github.com/musiqpad/mqp-server/archive/master.zip)" button on the repo page. ![Download Link](http://i.imgur.com/QFImdTS.png)
3. Run `npm install` in the directory where your extracted files are located. This will install all the required node modules.
4. Copy the `serverconfig.example.js` to create the file `serverconfig.js` and make sure this is located in the root musiqpad folder.
5. Start the server by running `node start.js` or `npm start` file using node.
6. If everything went well, there should be no error messages.

## API
Please Refer to the [API Documentation](https://musiqpad.com/api/) for the Events, Actions and Data API's.

#### Support

Please email [support@musiqpad.com](mailto:support@musiqpad.com) if you have any questions or queries.
