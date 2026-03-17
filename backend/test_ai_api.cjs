const axios = require('axios');

async function test() {
  try {
    console.log('Testing AI Summary...');
    const summaryRes = await axios.post('http://localhost:5000/api/ai/summary', {
      context: 'Test context for summary.'
    }, {
      headers: {
        // We need a token because of 'authenticate' middleware
        // But let's see if it fails with 401 first or 500
        'Authorization': 'Bearer test-token' 
      }
    });
    console.log('Summary Res:', summaryRes.data);
  } catch (err) {
    console.error('Test Error:', err.response?.status, err.response?.data || err.message);
  }
}

test();
