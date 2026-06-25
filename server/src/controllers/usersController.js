export const getProfile = async (req, res) => {
  try {
    // TODO: fetch profile + interests + active hive for req.user.id
    res.json({ profile: null, message: 'getProfile — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    // TODO: validate and update profile fields for req.user.id
    res.json({ message: 'updateProfile — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const setupProfile = async (req, res) => {
  try {
    // TODO: multi-step profile setup — upsert profile, interests, availability
    res.json({ message: 'setupProfile — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCompatibility = async (req, res) => {
  try {
    // TODO: compute and return compatibility score between user and hive
    res.json({ score: null, reasons: [], message: 'getCompatibility — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
