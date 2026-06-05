export const register = async (req, res) => {
  try {
    // TODO: validate body, hash password, insert user, sign JWT, set httpOnly cookie
    res.status(201).json({ message: 'register — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    // TODO: find user by email, verify password, sign JWT, set httpOnly cookie
    res.json({ message: 'login — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const logout = async (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'logged out' });
};

export const me = async (req, res) => {
  // req.user is set by authenticate middleware
  res.json({ user: req.user });
};
