import jwt from 'jsonwebtoken';

export const requireAuth = (req, res, next) => {
  return authenticate(req, res, next);
};

export const authenticate = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
};
