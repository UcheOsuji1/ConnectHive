export const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like'  },
  { key: 'love', emoji: '❤️', label: 'Love'  },
  { key: 'haha', emoji: '😂', label: 'Haha'  },
  { key: 'wow',  emoji: '😮', label: 'Wow'   },
  { key: 'sad',  emoji: '😢', label: 'Sad'   },
];

export function reactionByKey(key) {
  return REACTIONS.find(r => r.key === key) ?? REACTIONS[0];
}
