import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // The shared workspace package ships TypeScript source, so it is bundled rather than required at runtime.
  noExternal: ['@teampilot/shared'],
});
