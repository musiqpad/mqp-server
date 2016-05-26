const ghdownload = require('github-download');
const request = require('request');
var prompt = require('prompt-sync')();

function download(tag) {
  ghdownload({user: 'musiqpad', repo: 'mqp-server', ref: tag}, process.cwd() + "/test") // + "/test" is only for testing and will be removed when this is released!
  .on('dir', function(dir) {
    console.log(dir)
  })
  .on('file', function(file) {
    console.log(file)
  })
  .on('error', function(err) {
    console.error(err)
  })
  .on('end', function() {
    console.log('end');
  })
}

module.exports = function update() {
  var options = {
  url: 'https://api.github.com/repos/musiqpad/mqp-server/releases/latest',
    headers: {
      'User-Agent': 'request'
    }
  };
  request(options, function (err, res, data) {
    if (!err && res.statusCode == 200) {
      var q = prompt('This will overide all existing code exept new files and modules. Do you want to continue? (y/N) ').toLowerCase();
      if(q == "y") {
        console.log("Now updating to latest version (" + JSON.parse(data).tag_name + ")!");
        download(JSON.parse(data).tag_name)
      }
      else
        process.exit();
    }
  })
}
