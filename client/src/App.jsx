import { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import axios from 'axios';
import { Send, User, MoreVertical, MessageSquare, Phone, Video, Plus, ArrowLeft, LogOut, X } from 'lucide-react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import './App.css';

const API_URL = import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : 'http://localhost:5000/api';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPhone, setLoginPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');

  // Call feature state
  const [isCalling, setIsCalling] = useState(false);
  const [callType, setCallType] = useState('video'); // 'audio' or 'video'
  
  const messagesEndRef = useRef(null);

  // Auto Login on startup
  useEffect(() => {
    const savedPhone = localStorage.getItem('raabta_phone');
    if (savedPhone) {
      doLogin(savedPhone);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Socket events
  useEffect(() => {
    socket.connect();

    const handlePrivateMessage = (msg) => {
      // Only append if it's the current chat
      if (activeChat) {
        const isFromActiveContact = msg.sender._id === activeChat._id;
        const isToActiveContact = msg.receiver === activeChat._id || (msg.receiver._id && msg.receiver._id === activeChat._id);
        const isFromMe = msg.sender._id === currentUser?._id;
        
        if (isFromActiveContact || (isFromMe && isToActiveContact)) {
          // Check if it's already added optimistically (by me)
          setMessages(prev => {
            if (isFromMe && prev.some(p => p.text === msg.text && p._id && p._id.length > 10 && !p._id.includes(/[a-f]/))) {
              // Replace optimistic message with actual DB message
              return prev.map(p => (p.text === msg.text && p._id.length > 10 && !p._id.includes(/[a-f]/)) ? msg : p);
            }
            // Check for strict duplicates
            if (prev.some(p => p._id === msg._id)) return prev;
            return [...prev, msg];
          });
        }
      }
    };

    socket.on('private message', handlePrivateMessage);

    return () => {
      socket.off('private message', handlePrivateMessage);
      socket.disconnect();
    };
  }, [activeChat, currentUser]);

  const doLogin = async (phoneNumber) => {
    try {
      const res = await axios.post(`${API_URL}/login`, { phoneNumber });
      setCurrentUser(res.data);
      setContacts(res.data.contacts || []);
      localStorage.setItem('raabta_phone', phoneNumber);
      socket.emit('register', res.data._id);
    } catch (err) {
      alert('Error logging in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginPhone) return;
    setIsLoading(true);
    doLogin(loginPhone);
  };

  const handleLogout = () => {
    localStorage.removeItem('raabta_phone');
    setCurrentUser(null);
    setActiveChat(null);
    setContacts([]);
    socket.disconnect();
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
      const msgText = inputMessage;
      
      // Optimistic Update: Show message instantly in UI
      const optimisticMsg = {
        _id: Date.now().toString(), // temporary ID
        sender: currentUser,
        receiver: activeChat._id,
        text: msgText,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, optimisticMsg]);

      socket.emit('private message', {
        senderId: currentUser._id,
        receiverId: activeChat._id,
        text: msgText
      });
      setInputMessage('');
    }
  };

  const startCall = (type) => {
    setCallType(type);
    setIsCalling(true);
  };

  const endCall = () => {
    setIsCalling(false);
  };

  if (isLoading) {
    return <div className="login-container"><div style={{color: 'white'}}>Loading...</div></div>;
  }

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

  // Generate unique room name based on both user IDs sorted
  const roomName = activeChat ? `RaabtaCall_${[currentUser._id, activeChat._id].sort().join('')}` : '';

  return (
    <div className="app-container">
      {/* Sidebar - Hidden on mobile if activeChat exists */}
      <div className={`sidebar ${(activeChat || isCalling) ? 'hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="profile-pic">
            <User size={24} color="#fff" />
          </div>
          <div className="header-icons">
            <MessageSquare size={20} className="icon" />
            <Plus size={24} className="icon" onClick={() => setShowAddContact(!showAddContact)} title="Add Contact" />
            <LogOut size={20} className="icon" onClick={handleLogout} title="Logout" />
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
              onClick={() => {
                loadChat(contact);
                setIsCalling(false); // End call if switching chats
              }}
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

      {/* Main Area */}
      <div className={`main-chat ${(!activeChat && !isCalling) ? 'hidden-mobile' : ''}`}>
        {isCalling ? (
          <div className="call-container">
            <div className="call-header">
              <h3>Calling {activeChat.phoneNumber}</h3>
              <button onClick={endCall} className="end-call-btn">
                <X size={24} /> End Call
              </button>
            </div>
            <JitsiMeeting
              domain="meet.jit.si"
              roomName={roomName}
              configOverwrite={{
                startWithAudioMuted: false,
                startWithVideoMuted: callType === 'audio',
              }}
              interfaceConfigOverwrite={{
                DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
              }}
              userInfo={{
                displayName: currentUser.phoneNumber
              }}
              onApiReady={(externalApi) => {
                // Attach custom event listeners here if needed
                externalApi.addListener('videoConferenceLeft', endCall);
              }}
              getIFrameRef={(iframeRef) => {
                iframeRef.style.height = '100%';
                iframeRef.style.width = '100%';
              }}
            />
          </div>
        ) : activeChat ? (
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
                <Video size={20} className="icon" onClick={() => startCall('video')} title="Video Call" />
                <Phone size={20} className="icon" onClick={() => startCall('audio')} title="Audio Call" />
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
