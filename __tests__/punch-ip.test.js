const { ipv4ToInt, inCidr, clientIp, classifyIp, punchRecord } = require('../backend/punch-ip');

const offices = [{ name: '示範辦公室', cidrs: ['203.0.113.0/28', '198.51.100.7'] }];

describe('punch IP location (back office)', () => {
  test('ipv4ToInt parses valid and rejects invalid', () => {
    expect(ipv4ToInt('0.0.0.1')).toBe(1);
    expect(ipv4ToInt('::ffff:10.0.0.1')).toBe(ipv4ToInt('10.0.0.1'));
    expect(ipv4ToInt('256.0.0.1')).toBeNull();
    expect(ipv4ToInt('abc')).toBeNull();
  });

  test('inCidr matches ranges and single addresses', () => {
    expect(inCidr('203.0.113.5', '203.0.113.0/28')).toBe(true);
    expect(inCidr('203.0.113.16', '203.0.113.0/28')).toBe(false);
    expect(inCidr('198.51.100.7', '198.51.100.7')).toBe(true);
    expect(inCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(inCidr('1.2.3.4', '1.2.3.0/33')).toBe(false);
  });

  test('clientIp skips trusted proxies and ignores a spoofed leftmost value', () => {
    const h = { 'x-forwarded-for': '6.6.6.6, 203.0.113.5, 35.191.0.1' };
    expect(clientIp(h, '10.0.0.1', 2)).toBe('203.0.113.5');
    expect(clientIp({ 'x-forwarded-for': '203.0.113.5' }, '10.0.0.1', 1)).toBe('203.0.113.5');
    expect(clientIp({}, '::ffff:192.0.2.9')).toBe('192.0.2.9');
    expect(clientIp({}, '')).toBeNull();
  });

  test('classifyIp labels office, other and unknown', () => {
    expect(classifyIp('203.0.113.5', offices)).toEqual({ kind: 'office', place: '示範辦公室' });
    expect(classifyIp('100.64.0.1', offices)).toEqual({ kind: 'other', place: null });
    expect(classifyIp(null, offices)).toEqual({ kind: 'unknown', place: null });
  });

  test('punchRecord keeps the IP for the back office and a five-year retention date', () => {
    const r = punchRecord({ empId: 'A004', type: 'in', headers: { 'x-forwarded-for': '203.0.113.5' }, socketAddress: '10.0.0.1', offices, trustedHops: 1, now: new Date('2026-10-21T00:05:00Z') });
    expect(r).toMatchObject({ empId: 'A004', type: 'in', ip: '203.0.113.5', netKind: 'office', netPlace: '示範辦公室', keepUntil: '2031-10-21' });
  });
});
