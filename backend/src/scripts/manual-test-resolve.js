// Test script for the resolve endpoint
// Usage: node test-resolve-endpoint.js <eventId>

const eventId = process.argv[2];

if (!eventId) {
  console.log('Usage: node test-resolve-endpoint.js <eventId>');
  console.log('Example: node test-resolve-endpoint.js s4XdAJciA3nqy0uc6itQ');
  process.exit(1);
}

const fetch = require('node-fetch');

async function testResolve() {
  try {
    console.log(`Testing resolve endpoint for event: ${eventId}`);
    
    const response = await fetch(`http://localhost:3000/events/resolve/${eventId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log(`✅ Event resolved successfully!`);
      console.log(`   Acceptors archived: ${data.acceptorsArchived}`);
    } else {
      console.log(`❌ Failed to resolve event: ${data.message}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testResolve();
