import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  replyTo: { type: Object, default: null },
  reaction: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);
