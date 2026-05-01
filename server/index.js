import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import User from './models/User.js';
import Message from './models/Message.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Database Connection
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/raabta')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// API Routes
app.post('/api/login', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

  try {
    let user = await User.findOne({ phoneNumber }).populate('contacts', 'phoneNumber');
    if (!user) {
      user = new User({ phoneNumber });
      await user.save();
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/add', async (req, res) => {
  const { userId, contactNumber } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.phoneNumber === contactNumber) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    const contact = await User.findOne({ phoneNumber: contactNumber });
    if (!contact) return res.status(404).json({ error: 'User with this number does not exist' });

    if (!user.contacts.includes(contact._id)) {
      user.contacts.push(contact._id);
      await user.save();
    }
    
    // Auto add back for testing convenience
    if (!contact.contacts.includes(user._id)) {
      contact.contacts.push(user._id);
      await contact.save();
    }

    const updatedUser = await User.findById(userId).populate('contacts', 'phoneNumber');
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/:userId/:contactId', async (req, res) => {
  const { userId, contactId } = req.params;
  try {
    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: contactId },
        { sender: contactId, receiver: userId }
      ]
    }).sort('createdAt');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io Implementation
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register', async (userId) => {
    socket.join(userId);
    await User.findByIdAndUpdate(userId, { socketId: socket.id });
    console.log(`User ${userId} registered to socket ${socket.id}`);
  });

  socket.on('private message', async ({ senderId, receiverId, text }) => {
    try {
      const msg = new Message({ sender: senderId, receiver: receiverId, text });
      await msg.save();
      
      const populatedMsg = await Message.findById(msg._id).populate('sender', 'phoneNumber');

      // Emit to receiver
      io.to(receiverId).emit('private message', populatedMsg);
      // Emit to sender
      io.to(senderId).emit('private message', populatedMsg);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
