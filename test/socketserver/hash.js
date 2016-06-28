const test = require('ava');
const md5 = require('./../../socketserver/hash.js').md5;

test.before(() => {
});

test('hash', t => {
  t.is(md5('test'), '098f6bcd4621d373cade4e832627b4f6');
});
