// Atlas Search can't run in the in-memory test database, so these check the query it is sent and
// how its matches plug into the normal filter. (It is switched off in tests: regex search runs.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPipeline, wordClause, INDEX_DEFINITION, enabled } = require('../src/utils/atlasSearch');
const { buildPropertyFilter, searchWords } = require('../src/utils/propertyQuery');

test('every typed word must match; each may match fuzzily, by prefix or by alias', () => {
  const [stage] = searchPipeline(['loda', 'altis']);
  assert.equal(stage.$search.index, 'properties_search');
  assert.equal(stage.$search.compound.must.length, 2);

  const clause = wordClause('altis').compound;
  assert.equal(clause.minimumShouldMatch, 1);
  const fuzzy = clause.should.find((c) => c.text?.fuzzy);
  assert.deepEqual(fuzzy.text.fuzzy, { maxEdits: 1, prefixLength: 1 });
  assert.ok(clause.should.some((c) => c.autocomplete?.path === 'projectName'), 'prefixes ("andh") match');

  const alias = wordClause('bengaluru').compound.should;
  assert.ok(alias.some((c) => Array.isArray(c.text?.query) && c.text.query.includes('bangalore')));
  assert.ok(alias.every((c) => !(c.text?.fuzzy && Array.isArray(c.text.query))), 'aliases are never fuzzy ("blr" would match anything)');

  assert.equal(wordClause('400092').compound.should.find((c) => c.text?.path?.length > 5).text.fuzzy, undefined, 'numbers are exact');
});

test('the index covers the searched fields with prefix search on names and places', () => {
  const f = INDEX_DEFINITION.mappings.fields;
  assert.equal(INDEX_DEFINITION.mappings.dynamic, false);
  assert.ok(f.projectName.some((x) => x.type === 'autocomplete'));
  assert.ok(f.locality.some((x) => x.type === 'autocomplete'));
  assert.equal(f.amenities.type, 'string');
  assert.equal(f.location.type, 'document');
});

test('Atlas matches replace the regex word matching; filters stay', () => {
  const q = { search: '2 bhk lodha altus', city: 'Mumbai' };
  assert.deepEqual(searchWords(q), ['lodha', 'altus']);
  // Regexes print as their pattern (JSON.stringify would print {}).
  const show = (f) => JSON.stringify(f, (k, v) => (v instanceof RegExp ? v.source : v));
  const json = show(buildPropertyFilter(q, { textIds: ['a', 'b'] }));
  assert.ok(json.includes('"$in":["a","b"]'));
  assert.ok(!json.includes('lodha'), 'no regex for the words');
  assert.ok(json.includes('filterFields.bhk'), 'the BHK named in the text is still a filter');
  assert.ok(show(buildPropertyFilter(q)).includes('lodha'), 'without Atlas, regexes as before');
});

test('Atlas Search is off in tests (and whenever ATLAS_SEARCH_INDEX is empty)', () => {
  assert.equal(enabled(), false);
});
