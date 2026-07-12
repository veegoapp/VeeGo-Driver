export const Animation = {
  duration: {
    instant: 100,
    fast: 200,
    normal: 300,
    slow: 500,
    slower: 800,
  },

  spring: {
    sheet: {
      damping: 22,
      stiffness: 200,
    },

    tabBar: {
      damping: 32,
      stiffness: 380,
    },
  },
} as const;
