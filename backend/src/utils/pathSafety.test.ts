import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import { isPathSafe, isAllowedFileType, ALLOWED_DOC_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS } from './pathSafety.js';

describe('pathSafety Utilities', () => {
  it('allows paths within base directory', () => {
    const tmpDir = os.tmpdir();
    const safeFile = path.join(tmpDir, 'test.md');
    assert.equal(isPathSafe(safeFile, tmpDir), true);
  });

  it('blocks path traversal attacks attempting to escape baseDir', () => {
    const tmpDir = os.tmpdir();
    const traversalPath = path.join(tmpDir, '..', '..', 'etc', 'passwd');
    assert.equal(isPathSafe(traversalPath, tmpDir), false);
  });

  it('validates allowed document and image file types', () => {
    assert.ok(ALLOWED_DOC_EXTENSIONS.has('.md'));
    assert.ok(ALLOWED_DOC_EXTENSIONS.has('.json'));
    assert.ok(ALLOWED_IMAGE_EXTENSIONS.has('.png'));
    assert.ok(ALLOWED_IMAGE_EXTENSIONS.has('.svg'));

    assert.equal(isAllowedFileType('document.md'), true);
    assert.equal(isAllowedFileType('assets/image.png'), true);
    assert.equal(isAllowedFileType('README.md'), true);
    assert.equal(isAllowedFileType('.gitignore'), true);
    assert.equal(isAllowedFileType('malicious.exe'), false);
    assert.equal(isAllowedFileType('script.sh'), false);
  });

  it('allows git internal files regardless of extension', () => {
    assert.equal(isAllowedFileType('.git/config'), true);
    assert.equal(isAllowedFileType('.git/HEAD'), true);
    assert.equal(isAllowedFileType('.github/workflows/ci.yml'), true);
  });
});
