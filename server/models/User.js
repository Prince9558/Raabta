import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  socketId: { type: String, default: null },
  contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
