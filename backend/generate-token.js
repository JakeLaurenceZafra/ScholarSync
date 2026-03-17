import jwt from 'jsonwebtoken';

// Change this in your generation script:
const token = jwt.sign(
  { id: 1, email: 'test@test.com', role: 'Adviser' }, // Changed 'Admin' to 'Adviser'
  process.env.JWT_SECRET || 'test'
);

console.log('YOUR_NEW_TOKEN:', token);