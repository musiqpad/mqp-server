const test = require('ava');
const DBUtils = require('./../../socketserver/database_util');

function makePass(t, input, expected) {
  t.is(DBUtils.makePass(input[0], input[1]), expected);
}

function validateEmail(t, input, expected) {
  t.is(DBUtils.validateEmail(input), expected);
}

function validateUsername(t, input, expected) {
  t.is(DBUtils.validateUsername(input), expected);
}

test('Creates correct password hash with salt', makePass, ['test', 'randomSalt'], '4b4e47738ba3b7aab65e421787b519ff');
test('Creates correct hash without salt', makePass, ['test', null], '098f6bcd4621d373cade4e832627b4f6');
test('Hash is always converted to a string', makePass, ['ximaz', null], '61529519452809720693702583126814');

test('user@example.com is a valid email', validateEmail, 'user@example.com', true);
test('@example.com isn\'t a valid email', validateEmail, '@example.com', false);
test('user@example. isn\'t a valid email', validateEmail, 'user@example.', false);

test('123 is a valid username', validateUsername, '123', true);
test('123456789101112131415 is\n a valid username', validateUsername, '123456789101112131415', false);
test('*user* is\n a valid username', validateUsername, '*user*', false);
test('test_user is a valid username', validateUsername, 'test_user', true);

