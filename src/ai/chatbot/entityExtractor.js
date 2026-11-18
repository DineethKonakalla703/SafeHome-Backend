import mongoose from 'mongoose';
import Amenity from '../../models/Amenity.js';

export const KNOWN_AMENITIES = [
  { amenityId: 'AM001', name: 'Community Hall', charge: 1000 },
  { amenityId: 'AM002', name: 'Badminton Court', charge: 200 },
  { amenityId: 'AM003', name: 'Tennis Court', charge: 250 },
  { amenityId: 'AM004', name: 'Swimming Pool & Kids Splash', charge: 150 },
  { amenityId: 'AM005', name: 'Gymnasium & Yoga Studio', charge: 100 },
];

export async function normalizeEntitiesAsync(intent, entities = {}, message = '') {
  let normalized = { ...entities };
  const lowerMsg = (message || '').toLowerCase();

  const ticketId = entities.ticketId || (message.match(/TK\d+/i) || [])[0];
  if (ticketId) normalized.ticketId = String(ticketId).toUpperCase();

  const blockName = entities.blockName || (message.match(/block\s+(?:named\s+)?([a-z0-9-]+)/i) || [])[1];
  if (blockName) normalized.blockName = String(blockName).toUpperCase();

  if (intent === 'QUERY_KNOWLEDGE') {
    normalized.question = entities.question || message;
  }

  if (intent === 'CREATE_AMENITY_BOOKING') {
    // 1. Resolve Amenity ID
    if (!normalized.amenityId) {
      let targetName = normalized.amenity || normalized.amenityName || '';
      if (!targetName) {
        if (/tennis/i.test(lowerMsg)) targetName = 'tennis';
        else if (/badminton/i.test(lowerMsg)) targetName = 'badminton';
        else if (/hall|community/i.test(lowerMsg)) targetName = 'hall';
        else if (/pool|swimming/i.test(lowerMsg)) targetName = 'pool';
        else if (/gym/i.test(lowerMsg)) targetName = 'gym';
      }

      let foundAmenity = null;
      if (mongoose.connection?.readyState === 1) {
        try {
          if (targetName) {
            foundAmenity = await Amenity.findOne({ name: new RegExp(targetName, 'i') }).lean();
          }
          if (!foundAmenity) {
            foundAmenity = (await Amenity.findOne({ name: /court/i }).lean()) || (await Amenity.findOne({}).lean());
          }
        } catch (_) {}
      }

      if (!foundAmenity) {
        foundAmenity = KNOWN_AMENITIES.find((a) =>
          targetName ? new RegExp(targetName, 'i').test(a.name) : false
        ) || (targetName.includes('court') ? KNOWN_AMENITIES[2] : KNOWN_AMENITIES[0]);
      }

      if (foundAmenity) {
        normalized.amenityId = foundAmenity.amenityId;
        normalized.amenityName = foundAmenity.name;
        normalized.charge = foundAmenity.charge || 0;
      }
    }

    // 2. Resolve Date
    if (!normalized.date || normalized.date === 'tomorrow' || /tomorrow/i.test(lowerMsg)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      normalized.date = tomorrow.toISOString().split('T')[0];
    } else if (normalized.date === 'today' || /today/i.test(lowerMsg)) {
      normalized.date = new Date().toISOString().split('T')[0];
    }

    // 3. Resolve TimeSlot
    if (!normalized.timeSlot) {
      let hour = 18; // Default 6 PM
      const timeMatch = lowerMsg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        const meridiem = (timeMatch[3] || '').toLowerCase();
        if (meridiem === 'pm' && h < 12) h += 12;
        if (meridiem === 'am' && h === 12) h = 0;
        if (h >= 0 && h <= 23) hour = h;
      } else if (normalized.time) {
        const h = parseInt(String(normalized.time), 10);
        if (!isNaN(h)) hour = h;
      }
      const startStr = `${String(hour).padStart(2, '0')}:00`;
      const endStr = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
      normalized.timeSlot = `${startStr}-${endStr}`;
    }
  }

  return normalized;
}

export function normalizeEntities(intent, entities = {}, message = '') {
  const ticketId = entities.ticketId || (message.match(/TK\d+/i) || [])[0];
  const blockName = entities.blockName || (message.match(/block\s+(?:named\s+)?([a-z0-9-]+)/i) || [])[1];
  return {
    ...entities,
    ...(ticketId ? { ticketId: String(ticketId).toUpperCase() } : {}),
    ...(blockName ? { blockName: String(blockName).toUpperCase() } : {}),
    question: entities.question || (intent === 'QUERY_KNOWLEDGE' ? message : entities.question),
  };
}
