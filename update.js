const gitdl = require('download-git-repo');
const request = require('request');
const yesno = require('yesno');
const exec = require('child_process').exec;

function download(tag) {
  gitdl('musiqpad/mqp-server#' + tag, process.cwd() + "/test", function (err) {
    if (err) {
      console.log(colors.red('Error: '.error) + err);
      process.exit();
    } else {
      console.log('Download finished, now (re)installing dependencies');
      console.log('This step might take some time ...');
      exec('npm install', { cwd: (process.cwd()) + "/test"}, function (error, stdout, stderr) {
        if (error) {
          console.error(`exec error: ${error}`);
          return;
        }
        else {
          console.log('Succesfully installed all dependencies of musiqpad');
          process.exit();
        }
      });
    }
  });
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
      yesno.ask('This will overide all existing code exept new files and modules. Do you want to continue? (y/N)', false, function (ok) {
        if(ok) {
          console.log("Now updating to latest version (" + JSON.parse(data).tag_name + ")!");
          download(JSON.parse(data).tag_name)
        }
        else
          process.exit();
      });
    }
    else
      console.log('Error getting the latest musiqpad version: ' + err)
  })
}
