const nconf = require('nconf');

function Database() {
    nconf.defaults({
      'db:dbType': 'level'
    });
    switch (nconf.get('db:dbType')) {
        case 'level':
            return require('./db_level');
        case 'mysql':
            return require('./db_mysql');
        case 'mongo':
            return require('./db_mongo');
        default:
            return require('./db_level');
    }
}

module.exports = new Database();
