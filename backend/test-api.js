import axios from 'axios';

async function check() {
  try {
    const res = await axios.get('http://localhost:5000/api/groups/1', {
      headers: { Authorization: 'Bearer test' }
    });
    console.log(res.data);
  } catch (err) {
    if (err.response) {
       console.error("STATUS:", err.response.status);
       console.error("BODY:", err.response.data);
    } else {
       console.error(err.message);
    }
  }
}

check();
