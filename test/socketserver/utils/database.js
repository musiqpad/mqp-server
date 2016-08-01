const test = require('ava');
const DBUtils = require('./../../../socketserver/utils/index').db;

function validateEmail(t, input, expected) {
  t.is(DBUtils.validateEmail(input), expected);
}

function validateUsername(t, input, expected) {
  t.is(DBUtils.validateUsername(input), expected);
}

test('user@example.com is a valid email', validateEmail, 'user@example.com', true);
test('@example.com isn\'t a valid email', validateEmail, '@example.com', false);
test('user@example. isn\'t a valid email', validateEmail, 'user@example.', false);

test('123 is a valid username', validateUsername, '123', true);
test('123456789101112131415 is\n a valid username', validateUsername, '123456789101112131415', false);
test('*user* is\n a valid username', validateUsername, '*user*', false);
test('test_user is a valid username', validateUsername, 'test_user', true);

