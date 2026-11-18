import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntitiesAsync } from '../ai/chatbot/entityExtractor.js';
import Ticket from '../models/Ticket.js';

test('Fix 1: normalizeEntitiesAsync resolves natural language amenity booking entities', async () => {
  const input = {
    amenity: 'tennis court',
    date: 'tomorrow',
    time: '18:00',
  };
  const normalized = await normalizeEntitiesAsync('CREATE_AMENITY_BOOKING', input, 'Book the tennis court tomorrow at 6 PM');

  assert.ok(normalized.amenityId, 'Should resolve amenityId');
  assert.ok(normalized.date, 'Should resolve date to YYYY-MM-DD');
  assert.match(normalized.date, /^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD');
  assert.equal(normalized.timeSlot, '18:00-19:00', 'Should format time slot to 18:00-19:00');
});

test('Fix 2: Ticket attachment schema accepts array riskType without CastError', () => {
  const sampleAttachment = {
    attachmentId: 'att-123',
    fileName: 'test.webp',
    originalName: 'test.webp',
    mimeType: 'image/webp',
    size: 26000,
    fileUrl: '/uploads/tickets/test.webp',
    uploadedBy: 'U003',
    aiImageAnalysis: {
      detectedIssue: 'Water pipe leaking under kitchen sink',
      visibleSafetyRisk: true,
      riskType: ['water_damage', 'slip_hazard', 'mold_risk', 'structural_damage'],
      observations: ['Active dripping', 'Near lower electrical outlet'],
      confidence: 0.95,
      provider: 'claude',
    },
  };

  const ticket = new Ticket({
    ticketId: 'TK-TEST-001',
    title: 'Test Complaint',
    description: 'Testing riskType array acceptance',
    residentId: 'U003',
    apartmentId: 'A102',
    blockId: 'B001',
    communityId: 'C001',
    category: 'Plumbing',
    severity: 'High',
    safetyRisk: true,
    suggestedAction: 'Immediate review',
    humanApprovalRequired: true,
    attachments: [sampleAttachment],
  });

  const validationError = ticket.validateSync();
  assert.equal(validationError, undefined, 'Ticket validation should pass with an array riskType');
  assert.ok(Array.isArray(ticket.attachments[0].aiImageAnalysis.riskType));
});

test('Fix 3: visitorRoutes registers /verify-pass before /:id wildcard', async () => {
  const { visitorRoutes } = await import('../routes/coreRoutes.js');
  const routePaths = visitorRoutes.stack.map((layer) => layer.route?.path).filter(Boolean);
  const verifyPassIdx = routePaths.indexOf('/verify-pass');
  const idWildcardIdx = routePaths.indexOf('/:id');

  assert.ok(verifyPassIdx !== -1, 'visitorRoutes must have /verify-pass registered');
  assert.ok(idWildcardIdx !== -1, 'visitorRoutes must have /:id registered');
  assert.ok(
    verifyPassIdx < idWildcardIdx,
    `/verify-pass (index ${verifyPassIdx}) must be registered before /:id (index ${idWildcardIdx}) so it is not intercepted as an ID`
  );
});

test('Fix 4: Visitor schema validates 10-digit Indian mobile numbers', async () => {
  const Visitor = (await import('../models/Visitor.js')).default;

  // 1. Invalid: starts with 1
  const v1 = new Visitor({ visitorId: 'V-TEST-1', name: 'Test', phone: '1234567890', purpose: 'Visit', residentId: 'U003', apartmentId: 'A102', blockId: 'B001' });
  const err1 = v1.validateSync();
  assert.ok(err1?.errors?.phone, 'Should reject phone starting with 1');

  // 2. Invalid: only 8 digits
  const v2 = new Visitor({ visitorId: 'V-TEST-2', name: 'Test', phone: '98765432', purpose: 'Visit', residentId: 'U003', apartmentId: 'A102', blockId: 'B001' });
  const err2 = v2.validateSync();
  assert.ok(err2?.errors?.phone, 'Should reject phone with fewer than 10 digits');

  // 3. Valid: 10 digits starting with 9
  const v3 = new Visitor({ visitorId: 'V-TEST-3', name: 'Test', phone: '9876543210', purpose: 'Visit', residentId: 'U003', apartmentId: 'A102', blockId: 'B001' });
  const err3 = v3.validateSync();
  assert.equal(err3, undefined, 'Should accept valid 10-digit Indian phone starting with 9');

  // 4. Valid: with +91 prefix
  const v4 = new Visitor({ visitorId: 'V-TEST-4', name: 'Test', phone: '+91 8765432109', purpose: 'Visit', residentId: 'U003', apartmentId: 'A102', blockId: 'B001' });
  const err4 = v4.validateSync();
  assert.equal(err4, undefined, 'Should accept valid Indian phone with +91 prefix');
});

test('Fix 5: updateWorkOrderStatus mandates photo proof and min 10 chars resolution notes for Completed status', async () => {
  const { updateWorkOrderStatus } = await import('../controllers/workOrderController.js');
  const WorkOrder = (await import('../models/WorkOrder.js')).default;

  // Case 1: Try completing without photo proof
  const fakeReqNoPhoto = {
    user: { userId: 'T002', role: 'TECHNICIAN' },
    params: { id: 'WO-TEST-1' },
    body: { status: 'Completed', completionNote: 'Replaced electrical fuse properly' },
  };
  const origFindOne = WorkOrder.findOne;
  WorkOrder.findOne = () => ({
    workOrderId: 'WO-TEST-1',
    status: 'In Progress',
    completionImage: null,
    completionNote: '',
    save: async () => {},
  });

  let errorNoPhoto = null;
  const fakeRes = { status: () => fakeRes, json: () => fakeRes };
  await updateWorkOrderStatus(fakeReqNoPhoto, fakeRes, (err) => { errorNoPhoto = err; });
  assert.ok(errorNoPhoto, 'Should reject completion when no photo is attached');
  assert.equal(errorNoPhoto.statusCode, 400);
  assert.match(errorNoPhoto.message, /photo/i);

  // Case 2: Try completing with photo but with short note (< 10 chars)
  const fakeReqShortNote = {
    user: { userId: 'T002', role: 'TECHNICIAN' },
    params: { id: 'WO-TEST-1' },
    body: { status: 'Completed', completionNote: 'fixed' },
  };
  WorkOrder.findOne = () => ({
    workOrderId: 'WO-TEST-1',
    status: 'In Progress',
    completionImage: { fileUrl: '/uploads/tickets/proof.jpg' },
    completionNote: '',
    save: async () => {},
  });

  let errorShortNote = null;
  await updateWorkOrderStatus(fakeReqShortNote, fakeRes, (err) => { errorShortNote = err; });
  assert.ok(errorShortNote, 'Should reject completion when resolution note is under 10 chars');
  assert.equal(errorShortNote.statusCode, 400);
  assert.match(errorShortNote.message, /10 characters/i);

  // Restore original findOne
  WorkOrder.findOne = origFindOne;
});
