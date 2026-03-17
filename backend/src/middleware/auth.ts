import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  console.log("DEBUG: Incoming Headers:", req.headers);
  console.log("DEBUG: Authorization Header:", req.headers['authorization']);
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Extract "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    // Verify the token using the same secret as your backend
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test');
    
    // Attach the decoded token payload (which includes the 'role') to the request object
    (req as any).user = decoded; 
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }
};

export const authorizeRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: "Access forbidden: insufficient permissions." });
    }
    next();
  };
};