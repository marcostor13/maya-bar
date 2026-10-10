module.exports = async () => {
  await globalThis.__E2E_MONGO__?.stop();
};
