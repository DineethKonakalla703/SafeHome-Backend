import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(rootDir, '../.env') });

import { connectDatabase } from '../src/config/db.js';
import Ticket from '../src/models/Ticket.js';
import WorkOrder from '../src/models/WorkOrder.js';
import Resident from '../src/models/Resident.js';
import Visitor from '../src/models/Visitor.js';

const formatDateTime = (val) => {
  if (!val) return 'N/A';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

async function inspect() {
  await connectDatabase();
  console.log('\n============================================================');
  console.log('       SAFEHOME-RAG LIVE DATABASE INSPECTOR               ');
  console.log('============================================================\n');

  console.log('--- RECENT RESIDENTS (Collection: residents) ---');
  const residents = await Resident.find().sort({ createdAt: -1 }).limit(5).lean();
  if (residents.length === 0) console.log('No residents found.');
  else {
    console.table(residents.map(r => ({
      ID: r.residentId,
      Name: r.name,
      Apartment: r.apartmentId,
      Block: r.blockId,
      Phone: r.phone,
      Status: r.status,
      Created: formatDateTime(r.createdAt)
    })));
  }

  console.log('\n--- RECENT TICKETS (Collection: tickets) ---');
  const tickets = await Ticket.find().sort({ createdAt: -1 }).limit(5).lean();
  if (tickets.length === 0) console.log('No tickets found.');
  else {
    console.table(tickets.map(t => ({
      ID: t.ticketId,
      Title: t.title?.substring(0, 30),
      Category: t.category,
      Priority: t.priority,
      Status: t.status,
      Unit: t.apartmentId,
      Created: formatDateTime(t.createdAt)
    })));
  }

  console.log('\n--- RECENT WORK ORDERS (Collection: workorders) ---');
  const workOrders = await WorkOrder.find().sort({ updatedAt: -1 }).limit(5).lean();
  if (workOrders.length === 0) console.log('No work orders found.');
  else {
    console.table(workOrders.map(w => ({
      WO_ID: w.workOrderId,
      Ticket: w.ticketId,
      Tech: w.technicianId || 'Unassigned',
      Status: w.status,
      HasPhoto: Boolean(w.completionPhoto || w.evidencePhoto),
      Updated: formatDateTime(w.updatedAt)
    })));
  }

  console.log('\n--- RECENT GATE PASSES (Collection: visitors) ---');
  const visitors = await Visitor.find().sort({ createdAt: -1 }).limit(5).lean();
  if (visitors.length === 0) console.log('No visitors found.');
  else {
    console.table(visitors.map(v => ({
      ID: v.visitorId,
      Name: v.name,
      Phone: v.phone,
      PassCode: v.passCode,
      Status: v.status,
      ApprovedBy: v.approvedBy || 'Pending',
      Created: formatDateTime(v.createdAt)
    })));
  }

  console.log('\n============================================================\n');
  await mongoose.disconnect();
}

inspect().catch(err => {
  console.error('Inspection error:', err);
  process.exit(1);
});
