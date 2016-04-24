var config = require('../serverconfig');

function Database(){
    config.db.dbType = config.db.dbType.toLowerCase() || 'level';

    switch(config.db.dbType){
        case 'level':
            return require('./db_level');
        case 'mysql':
            return require('./db_mysql');
        case 'mongo':
            return require('./db_mongo');
    }
}

module.exports = new Database();