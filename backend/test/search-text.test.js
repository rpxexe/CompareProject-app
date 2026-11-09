const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSearch, correctWord, correctSearch, buildVocabulary } = require('../src/utils/searchText');
const { startServer, models } = require('./helpers/harness');
const seed = require('./seed');

test('free text becomes filters plus leftover words', () => {
  assert.deepEqual(parseSearch('2 bhk flat for rent under 30k in andheri west'), {
    params: { bhk: '2', maxPrice: '30000', deal: 'rent', propertyTypes: ['apartment'] },
    words: ['andheri', 'west'],
  });
  assert.deepEqual(parseSearch('3BHK ready to move villa above 1.5 cr').params,
    { bhk: '3', minPrice: '15000000', propertyTypes: ['villa'], possession: ['ready'] });
  assert.equal(parseSearch('2 bedroom apartment').params.bhk, '2');
  assert.equal(parseSearch('1rk').params.bhk, '1');
  assert.equal(parseSearch('flat 80 lakh').params.maxPrice, '8000000', 'a bare budget is the maximum');
  assert.deepEqual(parseSearch('semi-furnished office space under construction').params,
    { furnishing: 'semi', propertyTypes: ['office'], possession: ['under_construction'] });
  assert.deepEqual(parseSearch('Rustomjee, Borivali 400068').words, ['rustomjee', 'borivali', '400068']);
  assert.deepEqual(parseSearch('show me the best properties near me'), { params: {}, words: [] });
});

test('misspelt words are corrected against listing words', () => {
  const vocab = buildVocabulary([{ title: 'Skyline Residency', locality: 'Andheri West' }, { locality: 'Borivali' }], ['title', 'locality']);
  assert.equal(correctWord('andhery', vocab), 'andheri');
  assert.equal(correctWord('borivli', vocab), 'borivali');
  assert.equal(correctWord('skylne', vocab), 'skyline');
  assert.equal(correctWord('andheri', vocab), null, 'known words stay');
  assert.equal(correctWord('resid', vocab), null, 'a word still being typed stays');
  assert.equal(correctWord('zzzzzz', vocab), null);
  assert.equal(correctSearch('2 bhk in Andhery west', vocab), '2 bhk in andheri west');
  assert.equal(correctSearch('andheri', vocab), null);
});

test('search endpoint: any words in any order, filters from text, typo tolerance', async () => {
  const t = await startServer();
  try {
    models.Property.reset();
    models.Property.seed(seed);
    const total = async (q) => (await t.call('GET', `/properties?search=${encodeURIComponent(q)}`)).body;
    assert.equal((await total('alpha colaba')).total, 1, 'developer + locality');
    assert.equal((await total('andheri skyline')).total, 1, 'words in any order');
    assert.equal((await total('alpha builders 3 bhk')).total, 1, 'bhk from text');
    assert.equal((await total('flats in mumbai under 2 cr')).total, 1, 'type, place and budget');
    assert.equal((await total('pool')).total, 1, 'amenities are searched');
    const typo = await total('harbor hieghts');
    assert.equal(typo.total, 1);
    assert.equal(typo.correctedSearch, 'harbour heights');
    assert.equal((await total('skyline')).correctedSearch, undefined);
    const count = (await t.call('GET', '/properties/count?search=colabba')).body;
    assert.deepEqual(count, { total: 1, correctedSearch: 'colaba' });
    const explicit = await t.call('GET', '/properties?search=alpha%202%20bhk&bhk=3');
    assert.equal(explicit.body.items[0].title, 'Harbour Heights', 'a filter picked on screen beats the text');
  } finally {
    t.close();
  }
});

test('a correction that still finds nothing is not reported', async () => {
  const t = await startServer();
  try {
    models.Property.reset();
    models.Property.seed(seed);
    const r = (await t.call('GET', '/properties?search=colabba%20zzzzzz')).body;
    assert.equal(r.total, 0);
    assert.equal(r.correctedSearch, undefined);
  } finally {
    t.close();
  }
});
