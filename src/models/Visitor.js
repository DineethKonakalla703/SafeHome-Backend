import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true },
  passCode: { type: String, default: null, index: true },
  name: { type: String, required: true },
  phone: {
    type: String,
    required: [true, 'Visitor phone number is required.'],
    validate: {
      validator: function (v) {
        const cleaned = String(v || '').replace(/\D/g, '').slice(-10);
        return /^[6-9]\d{9}$/.test(cleaned);
      },
      message: 'Please provide a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
    },
  },
  purpose: { type: String, required: true },
  residentId: { type: String, required: true, index: true },
  apartmentId: { type: String, required: true },
  blockId: { type: String, required: true, index: true },
  vehicleNumber: { type: String, default: null },
  entryTime: { type: Date, default: null },
  exitTime: { type: Date, default: null },
  status: { type: String, enum: ['Pending', 'Approved', 'Inside', 'Exited', 'Rejected'], default: 'Pending' },
  approvedBy: { type: String, default: null },
}, { timestamps: true, versionKey: false });

schema.pre('save', function (next) {
  if (this.phone) {
    this.phone = String(this.phone).replace(/\D/g, '').slice(-10);
  }
  if (!this.passCode) {
    this.passCode = `GP-${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

export default mongoose.model('Visitor', schema);
