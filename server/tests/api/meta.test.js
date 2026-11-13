const { useTestApp } = require('../helpers/testApp');

jest.setTimeout(30000);
const t = useTestApp('meta');

describe('E02 GET /meta/interests', () => {
  test('16 interests in file order, no auth needed', async () => {
    const res = await t.get('/api/v1/meta/interests');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(16);
    expect(res.body.items[0]).toEqual({
      interest: 'TEMPLES',
      label: 'Temples and shrines',
      category: 'CULTURE',
    });
    expect(res.body.items.map((i) => i.interest)).toEqual(t.pack.interests.map((i) => i.interest));
  });
});

describe('E03 GET /meta/destinations', () => {
  test('cities in catalog order, departure cities and the data window', async () => {
    const res = await t.get('/api/v1/meta/destinations');
    expect(res.status).toBe(200);
    expect(res.body.cities.map((c) => c.name)).toEqual(['Tokyo', 'Kyoto', 'Osaka', 'Dubai', 'Abu Dhabi']);
    expect(res.body.cities[1]).toEqual({
      name: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      timezone: 'Asia/Tokyo',
    });
    expect(res.body.departureCities).toEqual([
      { city: 'Bengaluru', airport: 'BLR' },
      { city: 'Delhi', airport: 'DEL' },
      { city: 'Mumbai', airport: 'BOM' },
      { city: 'Chennai', airport: 'MAA' },
    ]);
    expect(res.body.dataWindow).toEqual({ from: '2027-04-01', to: '2027-04-20' });
  });
});
