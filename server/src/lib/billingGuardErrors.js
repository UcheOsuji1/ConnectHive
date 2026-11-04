// PostgreSQL billing guards are expected admission conflicts, not server faults.
export function billingGuardError(error) {
  const messages = {
    P7301: "You've reached your active Hive limit (Free: 1; Plus: 3).",
    P7302: 'A verified paid subscription is required to join this Hive.',
    P7303: "You've reached your Free plan limit of five free Hives.",
    P7304: 'This Hive has reached its capacity, or its limit is below existing memberships and reservations.',
  };
  return messages[error.code] ? { status: error.code === 'P7302' ? 402 : 409, message: messages[error.code] } : null;
}
