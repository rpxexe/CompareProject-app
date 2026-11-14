const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, models } = require('./helpers/harness');

// One project imported as three units (two 3 BHK sizes and a 2 BHK) plus a standalone listing.
// Listing ids are 20-32 hex chars.
const ID = { u3a: 'a0000000000000000000003a', u2: 'a00000000000000000000002', u3b: 'a0000000000000000000003b', solo: 'b00000000000000000000001', hidden: 'c00000000000000000000001' };
const unit = (o) => ({ city: 'Hyderabad', locality: 'Kollur', propertyType: 'Flats/Apartments', developerName: 'Radhey', ...o });
const fixtures = [
  unit({ _id: ID.u3a, title: '3 BHK in Radhey Skye', projectName: 'Radhey Skye', projectKey: 'radhey-skye-kollur', bhk: 3, price: 15900000, createdAt: new Date('2026-03-03') }),
  unit({ _id: ID.u2, title: '2 BHK in Radhey Skye', projectName: 'Radhey Skye', projectKey: 'radhey-skye-kollur', bhk: 2, price: 10000000, createdAt: new Date('2026-03-01') }),
  unit({ _id: ID.u3b, title: '3 BHK in Radhey Skye - large', projectName: 'Radhey Skye', projectKey: 'radhey-skye-kollur', bhk: 3, price: 19600000, createdAt: new Date('2026-03-02') }),
  unit({ _id: ID.solo, title: 'Solo Villa', projectName: 'Solo Villa', bhk: 4, price: 30000000, createdAt: new Date('2026-02-01') }),
  unit({ _id: ID.hidden, title: '1 BHK in Radhey Skye', projectName: 'Radhey Skye', projectKey: 'radhey-skye-kollur', bhk: 1, price: 5000000, approvalStatus: 'pending', dataSource: 'manual' }),
];

let t;
test.before(async () => {
  t = await startServer();
  models.Property.reset();
  models.Property.seed(fixtures);
});
test.after(() => t.close());

test('without group=project the list is still one row per unit', async () => {
  const r = await t.call('GET', '/properties');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 4);
});

test('group=project returns one row per project with its starting price and BHKs', async () => {
  const r = await t.call('GET', '/properties?group=project');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 2);
  assert.equal(r.body.items.length, 2);
  // Newest first: the project's newest unit (u3a, 3 March) leads it.
  const [sky, solo] = r.body.items;
  assert.equal(sky.id, ID.u3a);
  assert.equal(sky.projectName, 'Radhey Skye');
  assert.equal(sky.projectUnits, 3);
  assert.deepEqual(sky.bhkOptions, ['2', '3']);
  assert.equal(sky.priceFromValue, 10000000);
  assert.equal(sky.priceFrom, '₹1 Cr');
  assert.equal(solo.id, ID.solo);
  assert.equal(solo.projectUnits, 1);
  assert.equal(solo.priceFrom, '₹3 Cr');
});

test('group=project: filters apply to units before grouping, and paging counts projects', async () => {
  const three = await t.call('GET', '/properties?group=project&bhk=3');
  const sky = three.body.items.find((i) => i.projectName === 'Radhey Skye');
  assert.equal(sky.projectUnits, 2, 'only the 3 BHK units match');
  assert.deepEqual(sky.bhkOptions, ['3']);
  assert.equal(sky.priceFrom, '₹1.59 Cr');

  const p1 = await t.call('GET', '/properties?group=project&limit=1&page=1');
  const p2 = await t.call('GET', '/properties?group=project&limit=1&page=2');
  assert.equal(p1.body.pages, 2);
  assert.notEqual(p1.body.items[0].projectKey, p2.body.items[0].projectKey);
});

test('group=project keeps the sort: price low to high leads with the cheapest unit', async () => {
  const r = await t.call('GET', '/properties?group=project&sort=price_asc');
  assert.equal(r.body.items[0].id, ID.u2);
});

test('count with group=project counts projects', async () => {
  assert.equal((await t.call('GET', '/properties/count')).body.total, 4);
  assert.equal((await t.call('GET', '/properties/count?group=project')).body.total, 2);
});

test('GET /properties/:id/units lists every public unit of the project, by BHK then price', async () => {
  const r = await t.call('GET', `/properties/${ID.u3b}/units`);
  assert.equal(r.status, 200);
  assert.equal(r.body.projectKey, 'radhey-skye-kollur');
  assert.deepEqual(r.body.units.map((u) => u.id), [ID.u2, ID.u3a, ID.u3b], 'pending unit hidden');
  assert.equal(r.body.units[0].bhk, '2');
  assert.equal(r.body.units[0].price, '₹1 Cr');

  const solo = await t.call('GET', `/properties/${ID.solo}/units`);
  assert.deepEqual(solo.body.units.map((u) => u.id), [ID.solo]);
  assert.equal((await t.call('GET', '/properties/ffffffffffffffffffffffff/units')).status, 404);
});

test('count with by=city says where the matches are', async () => {
  const r = (await t.call('GET', '/properties/count?group=project&by=city')).body;
  assert.equal(r.total, 2);
  assert.deepEqual(r.cities, [{ city: 'Hyderabad', count: 2 }]);
  const plain = (await t.call('GET', '/properties/count')).body;
  assert.equal(plain.cities, undefined, 'only when asked');
});

test('compare adds the BHKs each whole project offers', async () => {
  const r = (await t.call('GET', `/properties/compare?ids=${ID.u3b},${ID.solo}`)).body;
  assert.equal(r.items.length, 2);
  const [sky, solo] = r.items;
  assert.equal(sky.id, ID.u3b, 'the compared unit itself');
  assert.equal(sky.bhk, '3');
  assert.deepEqual(sky.bhkOptions, ['2', '3'], 'every BHK of the project, pending units excluded');
  assert.equal(sky.projectUnits, 3);
  assert.equal(sky.priceFrom, '₹1 Cr');
  assert.deepEqual(solo.bhkOptions, ['4']);
});
