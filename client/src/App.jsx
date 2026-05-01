import { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import axios from 'axios';
import { Send, User, MoreVertical, MessageSquare, Phone, Video, Plus, ArrowLeft } from 'lucide-react';
import './App.css';

const API_URL = import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : 'http://localhost:5000/api';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPhone, setLoginPhone] = useState('');
  
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Socket events
  useEffect(() => {
    socket.connect();

    const handlePrivateMessage = (msg) => {
      // Only append if it's the current chat, otherwise maybe show a notification
      if (activeChat && (msg.sender._id === activeChat._id || msg.sender._id === currentUser?._id)) {
        setMessages(prev => [...prev, msg]);
      }
    };

    socket.on('private message', handlePrivateMessage);

    return () => {
      socket.off('private message', handlePrivateMessage);
      socket.disconnect();
    };
  }, [activeChat, currentUser]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginPhone) return;
    try {
      const res = await axios.post(`${API_URL}/login`, { phoneNumber: loginPhone });
      setCurrentUser(res.data);
      setContacts(res.data.contacts || []);
      socket.emit('register', res.data._id);
    } catch (err) {
      alert('Error logging in');
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContactPhone) return;
    try {
      const res = await axios.post(`${API_URL}/contacts/add`, {
        userId: currentUser._id,
        contactNumber: newContactPhone
      });
      setContacts(res.data.contacts);
      setShowAddContact(false);
      setNewContactPhone('');
    } catch (err) {
      alert(err.response?.data?.error || 'Error adding contact');
    }
  };

  const loadChat = async (contact) => {
    setActiveChat(contact);
    try {
      const res = await axios.get(`${API_URL}/messages/${currentUser._id}/${contact._id}`);
      setMessages(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && activeChat) {
      socket.emit('private message', {
        senderId: currentUser._id,
        receiverId: activeChat._id,
        text: inputMessage
      });
      setInputMessage('');
    }
  };

  if (!currentUser) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h2>Welcome to Raabta</h2>
          <p>Enter your phone number to continue</p>
          <form onSubmit={handleLogin}>
            <input 
              type="text" 
              placeholder="e.g. 9876543210" 
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
            />
            <button type="submit">Log In / Register</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar - Hidden on mobile if activeChat exists */}
      <div className={`sidebar ${activeChat ? 'hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="profile-pic">
            <User size={24} color="#fff" />
          </div>
          <div className="header-icons">
            <MessageSquare size={20} className="icon" />
            <Plus size={24} className="icon" onClick={() => setShowAddContact(!showAddContact)} />
            <MoreVertical size={20} className="icon" />
          </div>
        </div>

        {showAddContact && (
          <div className="add-contact-panel">
            <form onSubmit={handleAddContact}>
              <input 
                type="text" 
                placeholder="Enter phone number" 
                value={newContactPhone}
                onChange={e => setNewContactPhone(e.target.value)}
              />
              <button type="submit">Add</button>
            </form>
          </div>
        )}
        
        <div className="search-bar">
          <input type="text" placeholder="Search or start new chat" />
        </div>

        <div className="chat-list">
          {contacts.map((contact) => (
            <div 
              key={contact._id} 
              className={`chat-item ${activeChat?._id === contact._id ? 'active' : ''}`}
              onClick={() => loadChat(contact)}
            >
              <div className="profile-pic">
                <User size={24} color="#fff" />
              </div>
              <div className="chat-info">
                <div className="chat-name">
                  <h4>{contact.phoneNumber}</h4>
                </div>
                <p className="last-message">Tap to chat</p>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <div className="no-contacts">
              <p>No contacts yet. Add someone to start chatting!</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area - Hidden on mobile if NO activeChat */}
      <div className={`main-chat ${!activeChat ? 'hidden-mobile' : ''}`}>
        {activeChat ? (
          <>
            <div className="chat-header">
              <div className="chat-header-info">
                <ArrowLeft 
                  size={24} 
                  className="icon back-btn" 
                  onClick={() => setActiveChat(null)} 
                />
                <div className="profile-pic">
                  <User size={24} color="#fff" />
                </div>
                <div className="chat-title">
                  <h3>{activeChat.phoneNumber}</h3>
                  <p>Online</p>
                </div>
              </div>
              <div className="header-icons">
                <Video size={20} className="icon" />
                <Phone size={20} className="icon" />
                <MoreVertical size={20} className="icon" />
              </div>
            </div>

            <div className="messages-container">
              {messages.map((msg, index) => {
                const isSentByMe = msg.sender === currentUser._id || msg.sender?._id === currentUser._id;
                return (
                  <div key={index} className={`message ${isSentByMe ? 'sent' : 'received'}`}>
                    <p>{msg.text}</p>
                    <span className="msg-time">
                      {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
              <form onSubmit={sendMessage} className="chat-form">
                <input
                  type="text"
                  placeholder="Type a message"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                />
                <button type="submit" disabled={!inputMessage.trim()}>
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="welcome-placeholder">
            <div className="welcome-content">
              <h2>Raabta Web</h2>
              <p>Send and receive messages without keeping your phone online.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
