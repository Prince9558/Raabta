import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  socketId: { type: String },
  contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('User', userSchema);
