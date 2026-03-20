import jwt from 'jsonwebtoken';
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "No token provided." });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test');
        req.user = decoded;
        next();
    }
    catch (err) {
        return res.status(403).json({ error: "Invalid token." });
    }
};
export const authorizeRole = (roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role;
        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({ error: "Forbidden: insufficient permissions." });
        }
        next();
    };
};
//# sourceMappingURL=auth.js.map