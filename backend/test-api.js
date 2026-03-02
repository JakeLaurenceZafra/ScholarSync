import jwt from 'jsonwebtoken';
import 'dotenv/config';

const token = jwt.sign(
    { id: 3, email: 'student@example.com', role: 'Student' },
    process.env.JWT_SECRET || 'test',
    { expiresIn: '1h' }
);

fetch('http://localhost:5000/api/courses', {
    headers: { Authorization: `Bearer ${token}` }
}).then(res => res.json()).then(data => console.log('Courses:', data))
    .catch(err => console.error('Error:', err));
