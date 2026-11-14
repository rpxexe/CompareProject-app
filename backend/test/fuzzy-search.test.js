const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, models } = require('./helpers/harness');
const seed = require('./seed');
const { wordRegex, correctSearch, splitWord, nearWords, dropWord, buildVocabulary } = require('../src/utils/searchText');
const { buildIndex } = require('../src/utils/projectIndex');

const vocab = buildVocabulary(
  [
    { title: 'Lodha Altus', locality: 'Borivali East', city: 'Mumbai' },
    { title: 'Altis Heights', locality: 'Whitefield', city: 'Bangalore' },
    { title: 'Skyline Residency', locality: 'Andheri West', city: 'Mumbai' },
  ],
  ['title', 'locality', 'city'],
);

test('aliases: the name people know finds the spelling listings use', () => {
  assert.ok(wordRegex('bengaluru').test('Bangalore'));
  assert.ok(wordRegex('gurugram').test('Gurgaon'));
  assert.ok(wordRegex('vizag').test('Visakhapatnam'));
  assert.ok(wordRegex('bombay').test('Navi Mumbai'));
  assert.ok(!wordRegex('bengaluru').test('Mumbai'));
  assert.ok(wordRegex('andh').test('Andheri West'), 'words still match from the start (typing in progress)');
});

test('joined and split words are fixed against listing words', () => {
  assert.equal(splitWord('lodhaaltus', vocab), 'lodha altus');
  assert.equal(splitWord('whitefield', vocab), null, 'a real word is never split');
  assert.equal(correctSearch('lodhaaltus', vocab), 'lodha altus');
  assert.equal(correctSearch('white field', vocab), 'whitefield');
  assert.equal(correctSearch('skylne andhery', vocab), 'skyline andheri');
});

test('near words and dropping words', () => {
  assert.deepEqual(nearWords('altis', vocab), ['altus']);
  assert.equal(dropWord('3 bhk in xyzqwe', 'xyzqwe'), '3 bhk', 'no dangling "in"');
  assert.equal(dropWord('lodha altus luxury', 'luxury'), 'lodha altus');
});

test('search endpoint: aliases, relaxing and near words', async () => {
  const t = await startServer();
  try {
    models.Property.reset();
    models.Property.seed([
      ...seed,
      { title: 'Prestige Lakeside', projectName: 'Prestige Lakeside', city: 'Bangalore', locality: 'Whitefield', propertyType: 'Flats/Apartments', bhk: 2, price: 9000000 },
      { title: 'Altus Towers', projectName: 'Altus Towers', city: 'Mumbai', locality: 'Borivali East', propertyType: 'Flats/Apartments', bhk: 3, price: 30000000 },
      { title: 'Altis Court', projectName: 'Altis Court', city: 'Pune', locality: 'Baner', propertyType: 'Flats/Apartments', bhk: 2, price: 8000000 },
    ]);
    const find = async (q) => (await t.call('GET', `/properties?search=${encodeURIComponent(q)}`)).body;

    const alias = await find('flats in bengaluru');
    assert.equal(alias.total, 1);
    assert.equal(alias.items[0].title, 'Prestige Lakeside');
    assert.equal(alias.correctedSearch, undefined, 'an alias is not a correction');

    const relaxed = await find('skyline luxury sea views');
    assert.ok(relaxed.total >= 1);
    assert.equal(relaxed.items[0].title, 'Skyline Residency');
    assert.equal(relaxed.correctedSearch, 'skyline', 'words that ruled everything out are dropped and reported');

    // "altis" is a real listing word (Altis Court), just not with "towers": the near word wins.
    const near = await find('altis towers');
    assert.equal(near.items[0].title, 'Altus Towers');
    assert.equal(near.correctedSearch, 'altus towers');

    const kept = await find('3 bhk in zzqqxx');
    assert.equal(kept.correctedSearch, '3 bhk', 'filters typed in the text are kept');
    assert.ok(kept.items.every((i) => i.bhk === '3'));

    assert.equal((await find('zzzzzz')).total, 0, 'nonsense alone finds nothing');
  } finally {
    t.close();
  }
});

test('project index merges keys of the same project, not namesakes', () => {
  const idx = buildIndex([
    { _id: 'a', projectKey: 'lodha-altus-borivali', projectName: 'Lodha Altus', city: 'Mumbai', locality: 'Borivali' },
    { _id: 'b', projectKey: 'lodha-altus-borivali-east', projectName: 'Lodha Altus', city: 'Mumbai', locality: 'Borivali East' },
    { _id: 'c', projectKey: 'sai-mauli-titwala', projectName: 'Sai Mauli', city: 'Mumbai', locality: 'Titwala' },
    { _id: 'd', projectKey: 'sai-mauli-vasai', projectName: 'Sai Mauli', city: 'Mumbai', locality: 'Vasai' },
    { _id: 'e', projectKey: 'ace-divino', projectName: 'ACE Divino', city: 'Noida', locality: 'Sector 1' },
    { _id: 'f', projectKey: 'ace-divino-2', projectName: 'Ace Divino', city: 'Noida', locality: '' },
  ]);
  assert.equal(idx.groupOf({ _id: 'b', projectKey: 'lodha-altus-borivali-east' }), 'lodha-altus-borivali');
  assert.deepEqual(idx.keysOf('lodha-altus-borivali').sort(), ['lodha-altus-borivali', 'lodha-altus-borivali-east']);
  assert.notEqual(idx.groupOf({ _id: 'c', projectKey: 'sai-mauli-titwala' }), idx.groupOf({ _id: 'd', projectKey: 'sai-mauli-vasai' }));
  assert.equal(idx.groupOf({ _id: 'f', projectKey: 'ace-divino-2' }), 'ace-divino', 'case differences and a missing locality still merge');
});

test('grouped lists and the units picker use merged projects', async () => {
  const t = await startServer();
  try {
    const ID = { a: 'd00000000000000000000001', b: 'd00000000000000000000002' };
    models.Property.reset();
    models.Property.seed([
      { _id: ID.a, title: 'Lodha Altus 2 BHK', projectName: 'Lodha Altus', projectKey: 'lodha-altus-borivali', city: 'Mumbai', locality: 'Borivali', bhk: 2, price: 20000000 },
      { _id: ID.b, title: 'Lodha Altus 3 BHK', projectName: 'Lodha Altus', projectKey: 'lodha-altus-borivali-east', city: 'Mumbai', locality: 'Borivali East', bhk: 3, price: 30000000 },
    ]);
    const list = (await t.call('GET', '/properties?group=project')).body;
    assert.equal(list.total, 1);
    assert.deepEqual(list.items[0].bhkOptions, ['2', '3']);
    assert.equal((await t.call('GET', '/properties/count?group=project')).body.total, 1);
    const units = (await t.call('GET', `/properties/${ID.b}/units`)).body;
    assert.deepEqual(units.units.map((u) => u.id), [ID.a, ID.b]);
    assert.equal((await t.call('GET', `/properties/${ID.b}`)).body.property.projectKey, units.projectKey);
  } finally {
    t.close();
  }
});

test('showroom searches find "Shop/Showroom" listings (indexed as shops)', async () => {
  const t = await startServer();
  try {
    models.Property.reset();
    models.Property.seed([
      { title: 'Lodha Signet', city: 'Thane', locality: 'Kolshet Road', propertyType: 'Shop/Showroom', propertyGroup: 'Commercial', price: 25000000, filterFields: { type: 'shop', segment: 'commercial', deal: 'sale' } },
      { title: 'Skyline Residency', city: 'Thane', locality: 'Majiwada', propertyType: 'Flats/Apartments', bhk: 2, price: 9000000, filterFields: { type: 'apartment', segment: 'residential', deal: 'sale' } },
    ]);
    for (const qs of ['search=showroom&city=Thane', 'search=showrooms%20in%20thane', 'propertyTypes=showroom&context=commercial&city=Thane', 'search=showroom&context=buy_residential&city=Thane']) {
      const r = (await t.call('GET', `/properties?${qs}`)).body;
      assert.deepEqual(r.items.map((i) => i.title), ['Lodha Signet'], qs);
    }
    const shops = (await t.call('GET', '/properties?search=shop&city=Thane')).body;
    assert.deepEqual(shops.items.map((i) => i.title), ['Lodha Signet'], 'still a shop too');
  } finally {
    t.close();
  }
});

test("the location's city matches whichever name the listings use", async () => {
  const t = await startServer();
  try {
    models.Property.reset();
    models.Property.seed([
      { title: 'Prestige Lakeside', city: 'Bangalore', locality: 'Whitefield', propertyType: 'Flats/Apartments', bhk: 2, price: 9000000 },
      { title: 'DLF Crest', city: 'Gurgaon', locality: 'Sector 54', propertyType: 'Flats/Apartments', bhk: 3, price: 50000000 },
    ]);
    const inCity = async (city) => (await t.call('GET', `/properties?city=${encodeURIComponent(city)}`)).body.items.map((i) => i.title);
    assert.deepEqual(await inCity('Bengaluru'), ['Prestige Lakeside']);
    assert.deepEqual(await inCity('Gurugram'), ['DLF Crest']);
    assert.deepEqual(await inCity('Pune'), []);
  } finally {
    t.close();
  }
});
