import 'dotenv/config';
import axios from 'axios';

async function testCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  console.log('Testing credentials for Client ID:', clientId);

  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: 'fake_code_to_check_client_secret_validity',
      redirect_uri: 'http://localhost:5000/auth/google/callback'
    });
    console.log(response.data);
  } catch (error) {
    if (error.response) {
      console.log('Google responded with status:', error.response.status);
      console.log('Error data:', error.response.data);
      if (error.response.data.error === 'invalid_client') {
        console.log('--- DIAGNOSIS: The CLIENT SECRET or CLIENT ID is invalid. ---');
      } else if (error.response.data.error === 'invalid_grant') {
        console.log('--- DIAGNOSIS: The Client Secret is CORRECT. The error is due to an invalid authorization code (expected since we used a fake one). ---');
      }
    } else {
      console.error(error.message);
    }
  }
}

testCreds();
