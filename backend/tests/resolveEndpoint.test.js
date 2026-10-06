const test = require('node:test');
const assert = require('node:assert');

test('HF-01: Resolve authorization logic validation', () => {
  // Authorization verification rule
  function isAuthorizedToResolve(caller, event) {
    if (!caller || !caller.uid) return { authorized: false, code: 401 };

    const callerUid = caller.uid;
    const callerRole = caller.role;
    const callerRegion = (caller.region || '').toLowerCase().trim();

    const eventOwnerUid = event.sos_clicked_by_uid || event.userId || event.uid;
    const eventRegion = (event.regionId || event.region || event.city || '').toLowerCase().trim();

    const isOwner = callerUid === eventOwnerUid;
    const isRegionalStaff = ['supervisor', 'admin'].includes(callerRole) && (
      !eventRegion || !callerRegion || callerRegion === eventRegion
    );

    if (isOwner || isRegionalStaff) {
      return { authorized: true, code: 200 };
    }
    return { authorized: false, code: 403 };
  }

  const mockEvent = {
    event_id: 'evt-123',
    sos_clicked_by_uid: 'victim-uid-456',
    regionId: 'solapur'
  };

  // 1. Unauthenticated
  assert.strictEqual(isAuthorizedToResolve(null, mockEvent).code, 401);

  // 2. Event owner (victim)
  const owner = { uid: 'victim-uid-456', role: 'user', region: null };
  assert.strictEqual(isAuthorizedToResolve(owner, mockEvent).code, 200);

  // 3. Authorized Solapur Supervisor
  const solapurSupervisor = { uid: 'sup-1', role: 'supervisor', region: 'Solapur' };
  assert.strictEqual(isAuthorizedToResolve(solapurSupervisor, mockEvent).code, 200);

  // 4. Unauthorized Pune Supervisor
  const puneSupervisor = { uid: 'sup-2', role: 'supervisor', region: 'Pune' };
  assert.strictEqual(isAuthorizedToResolve(puneSupervisor, mockEvent).code, 403);

  // 5. Random other citizen user
  const randomUser = { uid: 'other-citizen', role: 'user', region: null };
  assert.strictEqual(isAuthorizedToResolve(randomUser, mockEvent).code, 403);
});
