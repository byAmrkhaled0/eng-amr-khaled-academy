'use strict';

const assert = require('assert');
const { money, paymentStatus, paymentTotals } = require('../functions/payment-domain');

assert.strictEqual(money('250.555'), 250.56);
assert.strictEqual(paymentStatus(500, 0), 'unpaid');
assert.strictEqual(paymentStatus(500, 200), 'partial');
assert.strictEqual(paymentStatus(500, 500), 'paid');
assert.deepStrictEqual(paymentTotals({ expectedAmount: 500, paidAmount: 150 }, 100), {
  expectedAmount: 500,
  paidAmount: 250,
  remainingAmount: 250,
  status: 'partial'
});
assert.deepStrictEqual(paymentTotals({ expectedAmount: 500, paidAmount: 500 }, -500), {
  expectedAmount: 500,
  paidAmount: 0,
  remainingAmount: 500,
  status: 'unpaid'
});

console.log('✓ Monthly payment full/partial/cancellation calculations passed');
