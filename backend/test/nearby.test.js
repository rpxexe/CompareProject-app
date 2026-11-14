const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, models } = require('./helpers/harness');
const { originOf, positionOf, byDistance, distanceKm } = require('../src/utils/nearby');

// Shops around Mumbai; the searcher stands in Borivali.
const BORIVALI = { lat: 19.2307, lng: 72.8567 };
const shops = [
  { _id: 'far1', title: 'Shop in Vashi', propertyType: 'Shop', city: 'Navi Mumbai', locality: 'Vashi', coordinates: { lat: 19.0771, lng: 72.9986 } },
  { _id: 'farthest', title: 'Shop in Colaba', propertyType: 'Shop', city: 'Mumbai', locality: 'Colaba', coordinates: { lat: 18.9067, lng: 72.8147 } },
  { _id: 'near', title: 'Shop in Borivali', propertyType: 'Shop', city: 'Mumbai', locality: 'Borivali', coordinates: { lat: 19.2321, lng: 72.8553 } },
  { _id: 'nopos', title: 'Shop somewhere', propertyType: 'Shop', city: 'Mumbai', locality: 'Unknown' },
  { _id: 'mid', title: 'Shop in Andheri', propertyType: 'Shop', city: 'Mumbai', locality: 'Andheri', mapLink: 'https://maps.google.com/?q=19.1136,72.8697' },
];
const order = ['near', 'mid', 'far1', 'farthest', 'nopos'];

test('originOf accepts a real position only', () => {
  assert.deepEqual(originOf({ lat: '19.23', lng: '72.85' }), { lat: 19.23, lng: 72.85 });
  for (const q of [{}, { lat: '19' }, { lat: 'x', lng: '72' }, { lat: '91', lng: '72' }, { lat: '0', lng: '0' }, { lat: '', lng: '' }]) {
    assert.equal(originOf(q), null, JSON.stringify(q));
  }
});

test('positionOf reads coordinates, falls back to mapLink', () => {
  assert.deepEqual(positionOf(shops[2]), { lat: 19.2321, lng: 72.8553 });
  assert.deepEqual(positionOf(shops[4]), { lat: 19.1136, lng: 72.8697 });
  assert.equal(positionOf(shops[3]), null);
  assert.ok(Math.abs(distanceKm(BORIVALI, { lat: 18.9067, lng: 72.8147 }) - 36.3) < 1);
});

test('byDistance: nearest first, unknown positions last', () => {
  assert.deepEqual(byDistance(shops, BORIVALI).map((s) => s._id), order);
});

test.describe('GET /properties with lat/lng', () => {
  let t;
  test.before(async () => {
    t = await startServer();
    models.Property.reset();
    models.Property.seed(shops);
  });
  test.after(() => t.close());

  const q = `lat=${BORIVALI.lat}&lng=${BORIVALI.lng}`;

  test('a search lists nearby shops first, then farther ones', async () => {
    for (const extra of ['', '&sort=relevance', '&group=project']) {
      const r = await t.call('GET', `/properties?search=shop&${q}${extra}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.total, 5);
      assert.deepEqual(r.body.items.map((i) => i.id), order, extra);
    }
  });

  test('pages continue the distance order', async () => {
    const p1 = await t.call('GET', `/properties?search=shop&${q}&limit=2&page=1`);
    const p2 = await t.call('GET', `/properties?search=shop&${q}&limit=2&page=2`);
    assert.deepEqual([...p1.body.items, ...p2.body.items].map((i) => i.id), order.slice(0, 4));
    assert.equal(p1.body.pages, 3);
  });

  test('an explicit sort still wins over distance', async () => {
    const r = await t.call('GET', `/properties?search=shop&${q}&sort=newest`);
    assert.equal(r.status, 200);
    assert.notDeepEqual(r.body.items.map((i) => i.id), order);
  });
});
