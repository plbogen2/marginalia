import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  extractGlossaryTerms,
  getGlossaryConfig,
  saveGlossaryConfig,
  loadWorkspaceGlossary,
  getGlossaryWordsForSpellcheck,
  findAvailableGlossaryCandidates
} from './glossary.js';

test('Glossary Extraction & Parsing', async (t) => {
  await t.test('extractGlossaryTerms extracts character list items with definitions', () => {
    const markdown = `
# Dramatis Personae

### The Protagonist
* **Tibon Sen-Koldo** (43): Archival Assayer & Special Examiner of Caloric Jurisprudence at the High Assize in Ostra.
* **\`Sen-\`** (from Proto-Basque *seni*): Son / statutory male lineage.
* **Marta Ala-Eskor**: Bathhouse Master of the Lower Sinks.
    `;

    const { terms, words } = extractGlossaryTerms(markdown, 'lore/dramatis_personae.md');

    const tibon = terms.find(t => t.term === 'Tibon Sen-Koldo');
    assert.ok(tibon, 'Should extract Tibon Sen-Koldo');
    assert.match(tibon.definition || '', /Archival Assayer/);

    const sen = terms.find(t => t.term === 'Sen-');
    assert.ok(sen, 'Should extract Sen-');
    assert.match(sen.definition || '', /Son \/ statutory male lineage/);

    const marta = terms.find(t => t.term === 'Marta Ala-Eskor');
    assert.ok(marta, 'Should extract Marta Ala-Eskor');
    assert.match(marta.definition || '', /Bathhouse Master/);

    // Verify word tokens for spell check suppression
    assert.ok(words.has('tibon'));
    assert.ok(words.has('sen-koldo'));
    assert.ok(words.has('koldo'));
    assert.ok(words.has('sen'));
    assert.ok(words.has('marta'));
    assert.ok(words.has('ala-eskor'));
    assert.ok(words.has('eskor'));
  });

  await t.test('extractGlossaryTerms handles markdown headings, tables, and KV definitions', () => {
    const markdown = `
# World Terms

### Piotr / Piotr Euria
The emperor of the western realm.

| Term | Definition |
| Beseliac | The ancient empire across the pass |
| Cauldrons | High thermal volcanic basins |

Rule of the Counter-Roll: Hydraulic proof governing municipal pressure.
    `;

    const { terms, words } = extractGlossaryTerms(markdown, 'lore/world.md');

    assert.ok(terms.some(t => t.term === 'Piotr'));
    assert.ok(terms.some(t => t.term === 'Piotr Euria'));
    assert.ok(terms.some(t => t.term === 'Beseliac' && t.definition === 'The ancient empire across the pass'));
    assert.ok(terms.some(t => t.term === 'Rule of the Counter-Roll'));

    assert.ok(words.has('piotr'));
    assert.ok(words.has('euria'));
    assert.ok(words.has('beseliac'));
    assert.ok(words.has('cauldrons'));
  });

  await t.test('extractGlossaryTerms strips numbering, bold annotations, and filters out sentence headings', () => {
    const markdown = `
# Timeline & Lore

### 1. Mythic Era: The Cult of Lur & Mari **Cosmogenesis and the Primeval Pantheon**
Ancient primordial era.

### 10. The Second Great Rite & The Founding of the Magisterium
A very long heading that describes the entire historical event across ten sentences.

### 1. The Sun (*Eguski*) The great diurnal sphere of the world.

### The Great Valley of Jendefar ($150\\text{ Million tons}$)
The fertile basin.
    `;

    const { terms } = extractGlossaryTerms(markdown, 'lore/timeline.md');

    // Should extract clean terms
    assert.ok(terms.some(t => t.term === 'Mythic Era'));
    assert.ok(terms.some(t => t.term === 'The Sun'));
    assert.ok(terms.some(t => t.term === 'Eguski'));
    assert.ok(terms.some(t => t.term === 'The Great Valley of Jendefar'));

    // Should NOT extract whole sentences, numbered lines, bold asterisks, or LaTeX formulas as terms
    assert.ok(!terms.some(t => t.term.includes('**')));
    assert.ok(!terms.some(t => t.term.includes('\\text')));
    assert.ok(!terms.some(t => t.term.startsWith('1. ')));
    assert.ok(!terms.some(t => t.term.startsWith('10. ')));
    assert.ok(!terms.some(t => t.term === '10. The Second Great Rite & The Founding of the Magisterium'));
  });
});

test('Glossary Configuration and Workspace Resolution', async (t) => {
  const testWorkspace = '/tmp/marginalia_glossary_test_ws';
  await fs.rm(testWorkspace, { recursive: true, force: true });
  await fs.mkdir(path.join(testWorkspace, 'lore'), { recursive: true });

  try {
    // 1. Write sample lore file
    const loreContent = `
# Characters
* **Valeria Ala-Miren**: Chief Cartographer.
* **Xalla**: Scribe of the lower leats.
    `;
    await fs.writeFile(path.join(testWorkspace, 'lore', 'dramatis_personae.md'), loreContent, 'utf-8');

    // 2. Candidate discovery
    const candidates = await findAvailableGlossaryCandidates(testWorkspace);
    assert.ok(candidates.includes('lore/dramatis_personae.md'));

    // 3. Default config and loading
    const defaultConf = await getGlossaryConfig(testWorkspace);
    assert.strictEqual(defaultConf.autoDetect, true);
    assert.strictEqual(defaultConf.enableSpellcheck, true);

    const loaded = await loadWorkspaceGlossary(testWorkspace);
    assert.ok(loaded.resolvedFiles.includes('lore/dramatis_personae.md'));
    assert.ok(loaded.terms.some(t => t.term === 'Valeria Ala-Miren'));
    assert.ok(loaded.words.has('valeria'));
    assert.ok(loaded.words.has('ala-miren'));
    assert.ok(loaded.words.has('xalla'));

    // 4. Words for spellcheck
    const spellWords = await getGlossaryWordsForSpellcheck(testWorkspace);
    assert.ok(spellWords.has('valeria'));
    assert.ok(spellWords.has('xalla'));

    // 5. Update configuration
    const saved = await saveGlossaryConfig(testWorkspace, {
      paths: ['lore/dramatis_personae.md'],
      autoDetect: false,
      enableAutocomplete: true,
      enableSpellcheck: false
    });
    assert.strictEqual(saved.autoDetect, false);
    assert.strictEqual(saved.enableSpellcheck, false);

    const disabledSpellWords = await getGlossaryWordsForSpellcheck(testWorkspace);
    assert.strictEqual(disabledSpellWords.size, 0, 'Should be empty when enableSpellcheck is false');
  } finally {
    await fs.rm(testWorkspace, { recursive: true, force: true });
  }
});
