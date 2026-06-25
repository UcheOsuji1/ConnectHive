export const matchHives = async (req, res) => {
  try {
    // TODO: run compatibility matching for req.body.category + prefillData,
    //       return { hives: [...], waitingCount: N }
    res.json({ hives: [], waitingCount: 0, message: 'matchHives — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const saveDraft = async (req, res) => {
  try {
    // TODO: upsert draft hive for authenticated user
    res.json({ message: 'saveDraft — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getHives = async (req, res) => {
  try {
    // TODO: query hives with filters (category, location, search) + compatibility scores
    res.json({ hives: [], message: 'getHives — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getHive = async (req, res) => {
  try {
    // TODO: fetch hive by id with members, messages preview, join request status
    res.json({ hive: null, message: 'getHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyHive = async (req, res) => {
  try {
    // TODO: fetch hive(s) where req.user is an active member
    res.json({ hive: null, message: 'getMyHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createHive = async (req, res) => {
  try {
    // TODO: insert hive record, add creator as admin member, return { id, ...hive }
    res.status(201).json({ hive: null, message: 'createHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateHive = async (req, res) => {
  try {
    // TODO: verify requester is admin, update hive record
    res.json({ message: 'updateHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const joinHive = async (req, res) => {
  try {
    // TODO: create join request or add directly if open hive
    res.json({ message: 'joinHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getHiveMessages = async (req, res) => {
  try {
    // TODO: paginated message history for hive chat
    res.json({ messages: [], message: 'getHiveMessages — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
