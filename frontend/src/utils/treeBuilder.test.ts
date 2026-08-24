import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFileTree } from './treeBuilder.js';

describe('buildFileTree Utility', () => {
  it('builds a simple flat file list', () => {
    const paths = ['README.md', 'index.html', 'config.json'];
    const tree = buildFileTree(paths);

    assert.equal(tree.length, 3);
    assert.deepEqual(tree.map(n => n.name), ['config.json', 'index.html', 'README.md']);
    assert.ok(tree.every(n => !n.isDirectory));
  });

  it('builds nested folder hierarchies and sorts directories before files', () => {
    const paths = [
      'src/utils/tree.ts',
      'src/App.tsx',
      'README.md',
      'src/components/Button.tsx',
      'docs/intro.md'
    ];
    const tree = buildFileTree(paths);

    assert.equal(tree.length, 3);
    assert.equal(tree[0].name, 'docs');
    assert.ok(tree[0].isDirectory);
    assert.equal(tree[1].name, 'src');
    assert.ok(tree[1].isDirectory);
    assert.equal(tree[2].name, 'README.md');
    assert.ok(!tree[2].isDirectory);

    const srcNode = tree.find(n => n.name === 'src')!;
    assert.ok(srcNode.children);
    assert.equal(srcNode.children.length, 3);
    assert.equal(srcNode.children[0].name, 'components');
    assert.ok(srcNode.children[0].isDirectory);
    assert.equal(srcNode.children[1].name, 'utils');
    assert.ok(srcNode.children[1].isDirectory);
    assert.equal(srcNode.children[2].name, 'App.tsx');
    assert.ok(!srcNode.children[2].isDirectory);
  });

  it('handles empty input gracefully', () => {
    const tree = buildFileTree([]);
    assert.deepEqual(tree, []);
  });

  it('handles duplicate paths idempotently', () => {
    const paths = ['src/index.ts', 'src/index.ts'];
    const tree = buildFileTree(paths);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].name, 'src');
    assert.equal(tree[0].children?.length, 1);
    assert.equal(tree[0].children?.[0].name, 'index.ts');
  });
});
