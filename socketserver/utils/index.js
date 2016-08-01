const database = require('./database');
const hash = require('./hash');
const token = require('./token');

const utils = {

};
module.exports = Object.assign(utils, { db: database }, { hash }, { token });
