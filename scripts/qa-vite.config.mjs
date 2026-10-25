import { fileURLToPath } from 'node:url';
// Stable browser QA while independent source work finishes; normal dev keeps HMR.
export default { root: fileURLToPath(new URL('../', import.meta.url)), base: './', server: { hmr: false } };
