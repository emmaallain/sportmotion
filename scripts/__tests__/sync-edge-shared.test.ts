import { outdated, rewriteImports, SOURCE } from '../sync-edge-shared';

describe('edge functions shared code', () => {
  it('is in sync with src/game (run `npm run sync:edge` after changing the game logic)', () => {
    expect(outdated()).toEqual([]);
  });

  it('adds the extensions Deno needs', () => {
    const file = `${SOURCE}/engine/reducer.ts`;
    expect(rewriteImports(`import { a } from './state';`, file)).toBe(
      `import { a } from './state.ts';`,
    );
    expect(rewriteImports(`export * from '../catalog/index';`, file)).toBe(
      `export * from '../catalog/index.ts';`,
    );
    expect(rewriteImports(`import x from '../economy';`, file)).toBe(
      `import x from '../economy/index.ts';`,
    );
    expect(() => rewriteImports(`import x from './missing';`, file)).toThrow();
  });
});
