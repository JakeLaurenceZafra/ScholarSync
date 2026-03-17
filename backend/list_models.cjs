const axios = require('axios');

async function test() {
  try {
    console.log('Listing models...');
    const res = await axios.get('http://localhost:5000/api/ai/models'); // I should add this route or just use the logic
    console.log('Models:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('List Error:', err.response?.status, err.response?.data || err.message);
  }
}

test();
