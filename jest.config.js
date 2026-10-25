jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual('expo-modules-core');
  return {
    ...actual,
    // Provide fallback properties if specific sub-modules trigger the undefined error
  };
});
