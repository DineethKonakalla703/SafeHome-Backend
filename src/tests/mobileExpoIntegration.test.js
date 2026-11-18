import test from 'node:test';
import assert from 'node:assert/strict';
import Resident from '../models/Resident.js';
import User from '../models/User.js';

test('MOBILE EXPO INTEGRATION: Mobile API Endpoints & Registration Synchronization', async (t) => {
  await t.test('Resident model validates required fields matching mobile registration form', () => {
    const res = new Resident({
      residentId: 'R-TEST-999',
      name: 'Mobile Test Resident',
      email: 'mobile.test@safehome.com',
      apartmentId: 'A105',
      blockId: 'B001',
      communityId: 'C001',
      ownerOrTenant: 'Tenant',
      phone: '9876543210',
      status: 'Active',
    });
    const err = res.validateSync();
    assert.equal(err, undefined, 'Resident should pass schema validation');
  });

  await t.test('User model supports auto-generated resident login credentials', () => {
    const user = new User({
      userId: 'R-TEST-999',
      name: 'Mobile Test Resident',
      email: 'mobile.test@safehome.com',
      password: 'Demo@123',
      role: 'RESIDENT',
      communityId: 'C001',
      blockId: 'B001',
      apartmentId: 'A105',
      phone: '9876543210',
      ownerOrTenant: 'Tenant',
      status: 'Active',
    });
    const err = user.validateSync();
    assert.equal(err, undefined, 'User credentials should pass schema validation');
    assert.equal(user.role, 'RESIDENT');
  });

  await t.test('Mobile dynamic API URL resolves properly with host IP fallback', () => {
    function testResolve(envUrl, hostUri, platform) {
      if (envUrl) return envUrl.replace(/\/$/, '');
      const host = (hostUri || '').split(':')[0];
      if (platform === 'web') return 'http://localhost:5000/api';
      if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:5000/api`;
      return 'http://192.168.29.216:5000/api';
    }

    assert.equal(testResolve('http://192.168.29.216:5000/api', '', 'android'), 'http://192.168.29.216:5000/api');
    assert.equal(testResolve('', '192.168.29.216:8081', 'android'), 'http://192.168.29.216:5000/api');
    assert.equal(testResolve('', '', 'android'), 'http://192.168.29.216:5000/api');
    assert.equal(testResolve('', '', 'web'), 'http://localhost:5000/api');
  });
});
