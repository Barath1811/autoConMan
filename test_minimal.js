const fs = require('fs');
const path = require('path');

console.log('TEST: Script started');
console.log('Arguments:', process.argv.slice(2));

async function test() {
  console.log('TEST: In test function');
  const args = process.argv.slice(2);
  if (args.length === 2) {
    console.log('TEST: Pipeline mode with', args);
  }
}

test().catch(err => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
