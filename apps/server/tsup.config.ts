import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  // @beer/game ships TypeScript source, so it has to be bundled in.
  noExternal: ['@beer/game'],
});
