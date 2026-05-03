import { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import axios from 'axios';
import { Send, User, MoreVertical, MessageSquare, Phone, Video, Plus, ArrowLeft, LogOut, X, Smile, Paperclip, Camera, Mic, FileText, Image, Headphones, MapPin, BarChart2, Calendar, Sparkles, StopCircle } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
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
  
  // Reply feature
  const [replyingTo, setReplyingTo] = useState(null);
  const touchStartRef = useRef(null);
  const isTouchRef = useRef(false);
  const longPressTimerRef = useRef(null);

  // Reaction feature
  const [activeReactionMsg, setActiveReactionMsg] = useState(null);
  const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '❌'];
  
  // Context Menu for desktop right click
  const [contextMenu, setContextMenu] = useState(null);
  
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const documentRef = useRef(null);
  const audioRef = useRef(null);

  // Auto Login on startup
  useEffect(() => {
    const savedPhone = localStorage.getItem('raabta_phone');
    if (savedPhone) {
      doLogin(savedPhone);
    } else {
      setIsLoading(false);
    }
  }, []);

  const activeChatRef = useRef(activeChat);
  const currentUserRef = useRef(currentUser);
  const prevMessagesLengthRef = useRef(0);

  // Auto scroll to bottom
  useEffect(() => {
    if (messages.length !== prevMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Keep refs updated
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);
  
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Helper to update local storage for inactive chats
  const updateLocalStorageForChat = (contactId, updaterCallback) => {
    if (!currentUserRef.current) return;
    const key = `raabta_messages_${currentUserRef.current._id}_${contactId}`;
    const saved = localStorage.getItem(key);
    let chatMsgs = [];
    if (saved) {
      try { chatMsgs = JSON.parse(saved); } catch (e) {}
    }
    const updatedMsgs = updaterCallback(chatMsgs);
    localStorage.setItem(key, JSON.stringify(updatedMsgs));
  };

  // Auto save active chat messages
  useEffect(() => {
    if (activeChat && currentUser) {
      localStorage.setItem(`raabta_messages_${currentUser._id}_${activeChat._id}`, JSON.stringify(messages));
    }
  }, [messages, activeChat, currentUser]);

  // Handle Socket events
  useEffect(() => {
    socket.connect();

    const onConnect = () => {
      if (currentUserRef.current) {
        socket.emit('register', currentUserRef.current._id);
      }
    };

    const handlePrivateMessage = (msg) => {
      const currentActiveChat = activeChatRef.current;
      const currentUsr = currentUserRef.current;
      
      const isFromMe = msg.sender._id === currentUsr?._id;
      const otherContactId = isFromMe ? (msg.receiver._id || msg.receiver) : msg.sender._id;

      if (currentActiveChat && currentActiveChat._id === otherContactId) {
        if (!isFromMe) {
          socket.emit('mark as read', { senderId: msg.sender._id, receiverId: currentUsr._id });
        }
        setMessages(prev => {
          if (isFromMe && prev.some(p => p.text === msg.text && p._id && p._id.startsWith('optimistic_'))) {
            return prev.map(p => (p.text === msg.text && p._id && p._id.startsWith('optimistic_')) ? msg : p);
          }
          if (prev.some(p => p._id === msg._id)) return prev;
          return [...prev, msg];
        });
      } else {
        updateLocalStorageForChat(otherContactId, (prev) => {
          if (isFromMe && prev.some(p => p.text === msg.text && p._id && p._id.startsWith('optimistic_'))) {
            return prev.map(p => (p.text === msg.text && p._id && p._id.startsWith('optimistic_')) ? msg : p);
          }
          if (prev.some(p => p._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleReactionUpdated = (updatedMsg) => {
      setMessages(prev => prev.map(m => m._id === updatedMsg._id ? { ...m, reaction: updatedMsg.reaction } : m));
      // Also update in all local storage just in case (we don't know the chat ID easily here without checking)
      // Usually it's in the active chat, but if it's not, we'd need to search.
    };

    const handleMessagesRead = ({ receiverId }) => {
      setMessages(prev => prev.map(m => {
        if (m.receiver === receiverId || m.receiver?._id === receiverId) {
          return { ...m, status: 'read' };
        }
        return m;
      }));
    };

    const handleMessagesDelivered = ({ receiverId }) => {
      setMessages(prev => prev.map(m => {
        if ((m.receiver === receiverId || m.receiver?._id === receiverId) && m.status === 'sent') {
          return { ...m, status: 'delivered' };
        }
        return m;
      }));
    };

    const handleUserStatusUpdate = ({ userId, isOnline, lastSeen }) => {
      setContacts(prev => prev.map(c => c._id === userId ? { ...c, isOnline, lastSeen } : c));
      if (activeChatRef.current && activeChatRef.current._id === userId) {
        setActiveChat(prev => ({ ...prev, isOnline, lastSeen }));
      }
    };

    const handleMessageDeleted = (messageId) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    };

    socket.on('connect', onConnect);
    socket.on('private message', handlePrivateMessage);
    socket.on('reaction updated', handleReactionUpdated);
    socket.on('message deleted', handleMessageDeleted);
    socket.on('messages read', handleMessagesRead);
    socket.on('messages delivered', handleMessagesDelivered);
    socket.on('user status update', handleUserStatusUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('private message', handlePrivateMessage);
      socket.off('reaction updated', handleReactionUpdated);
      socket.off('message deleted', handleMessageDeleted);
      socket.off('messages read', handleMessagesRead);
      socket.off('messages delivered', handleMessagesDelivered);
      socket.off('user status update', handleUserStatusUpdate);
      socket.disconnect();
    };
  }, []); // Run only once on mount

  const doLogin = async (phoneNumber) => {
    try {
      const res = await axios.post(`${API_URL}/login`, { phoneNumber });
      setCurrentUser(res.data);
      const fetchedContacts = res.data.contacts || [];
      setContacts(fetchedContacts);
      localStorage.setItem('raabta_phone', phoneNumber);
      socket.emit('register', res.data._id);
      
      // Restore active chat if exists
      const savedChatId = localStorage.getItem('raabta_active_chat');
      if (savedChatId) {
        const contactToLoad = fetchedContacts.find(c => c._id === savedChatId);
        if (contactToLoad) {
          loadChat(contactToLoad, res.data._id);
        }
      }
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
    localStorage.removeItem('raabta_active_chat');
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

  const loadChat = async (contact, currentUserId = currentUser?._id) => {
    setActiveChat(contact);
    localStorage.setItem('raabta_active_chat', contact._id);
    
    // Load from local storage instead of backend API
    const key = `raabta_messages_${currentUserId}_${contact._id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }

    try {
      socket.emit('mark as read', { senderId: contact._id, receiverId: currentUserId });
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && activeChat) {
      const msgText = inputMessage;
      const replyData = replyingTo ? { 
        text: replyingTo.text, 
        senderName: (replyingTo.sender?._id || replyingTo.sender) === currentUser._id ? 'You' : activeChat.phoneNumber 
      } : null;
      
      // Optimistic Update: Show message instantly in UI
      const optimisticMsg = {
        _id: `optimistic_${Date.now()}`, // temporary ID
        sender: currentUser,
        receiver: activeChat._id,
        text: msgText,
        replyTo: replyData,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, optimisticMsg]);

      socket.emit('private message', {
        senderId: currentUser._id,
        receiverId: activeChat._id,
        text: msgText,
        replyTo: replyData
      });
      setInputMessage('');
      setReplyingTo(null);
    }
  };

  const sendReaction = (messageId, emoji) => {
    if (messageId && !messageId.startsWith('optimistic_')) {
      const reactionValue = emoji === '❌' ? '' : emoji;
      socket.emit('reaction', {
        messageId,
        receiverId: activeChat._id,
        reaction: reactionValue
      });
    }
  };

  const deleteMessage = (messageId) => {
    if (messageId && !messageId.startsWith('optimistic_')) {
      socket.emit('delete message', {
        messageId,
        receiverId: activeChat._id
      });
    }
  };

  const onTouchStart = (e, msg) => {
    isTouchRef.current = true;
    touchStartRef.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      id: msg._id || msg.text,
      msg: msg
    };

    longPressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setActiveReactionMsg(msg._id);
      touchStartRef.current = null;
    }, 500);
  };

  const onTouchMove = (e, msgId) => {
    if (!touchStartRef.current || touchStartRef.current.id !== msgId) return;
    
    const diffX = e.targetTouches[0].clientX - touchStartRef.current.x;
    const diffY = Math.abs(e.targetTouches[0].clientY - touchStartRef.current.y);

    if (diffY > 10 || Math.abs(diffX) > 10) {
      clearTimeout(longPressTimerRef.current);
    }

    if (diffX > 0 && diffX < 80) { // Limit max slide distance
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.style.transform = `translateX(${diffX}px)`;
      }
    }
  };

  const onTouchEnd = (msg) => {
    clearTimeout(longPressTimerRef.current);

    if (!touchStartRef.current || touchStartRef.current.id !== (msg._id || msg.text)) return;

    const el = document.getElementById(`msg-${msg._id || msg.text}`);
    if (el) {
      const match = el.style.transform.match(/translateX\((.+)px\)/);
      if (match && parseFloat(match[1]) > 40) {
        setReplyingTo(msg);
      }
      
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = 'translateX(0px)';
      
      setTimeout(() => {
        el.style.transition = '';
      }, 200);
    }
    
    touchStartRef.current = null;
    
    setTimeout(() => {
      isTouchRef.current = false;
    }, 500);
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    if (isTouchRef.current) return;
    
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      msg: msg
    });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (e.target.closest('.emoji-picker-react')) return;
      setActiveReactionMsg(null);
      setContextMenu(null);
      setShowAttachmentMenu(false);
      setShowEmojiPicker(false);
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleClickOutside, true);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleClickOutside, true);
    };
  }, []);

  const startCall = (type) => {
    setCallType(type);
    setIsCalling(true);
  };

  const endCall = () => {
    setIsCalling(false);
  };

  const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'raabta');

    try {
      const res = await axios.post('https://api.cloudinary.com/v1_1/drzcpveus/auto/upload', formData);
      return res.data.secure_url;
    } catch (err) {
      console.error('Error uploading to Cloudinary', err);
      return null;
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (file && activeChat) {
      const url = await uploadToCloudinary(file);
      if (url) {
        let prefix = 'DOC::';
        if (file.type.startsWith('image/')) prefix = 'IMG::';
        else if (file.type.startsWith('video/')) prefix = 'VID::';
        else if (file.type.startsWith('audio/')) prefix = 'AUD::';

        const msgText = `${prefix}${url}`;
        
        const optimisticMsg = {
          _id: `optimistic_${Date.now()}`,
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
        setShowAttachmentMenu(false);
      }
    }
    // reset input
    e.target.value = '';
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const url = await uploadToCloudinary(audioBlob);
          if (url) {
            const msgText = `AUD::${url}`;
            const optimisticMsg = {
              _id: `optimistic_${Date.now()}`,
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
          }
          
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Error accessing microphone', err);
        alert('Could not access microphone');
      }
    }
  };

  const getTicks = (status) => {
    if (status === 'read') return <span className="msg-ticks read">✓✓</span>;
    if (status === 'delivered') return <span className="msg-ticks delivered">✓✓</span>;
    return <span className="msg-ticks sent">✓</span>;
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
                  onClick={() => {
                    setActiveChat(null);
                    localStorage.removeItem('raabta_active_chat');
                  }} 
                />
                <div className="profile-pic">
                  <User size={24} color="#fff" />
                </div>
                <div className="chat-title">
                  <h3>{activeChat.phoneNumber}</h3>
                  <p>{activeChat.isOnline ? 'Online' : 'Offline'}</p>
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
                  <div 
                    key={index} 
                    id={`msg-${msg._id || msg.text}`}
                    className={`message ${isSentByMe ? 'sent' : 'received'}`}
                    onTouchStart={(e) => onTouchStart(e, msg)}
                    onTouchMove={(e) => onTouchMove(e, msg._id || msg.text)}
                    onTouchEnd={() => onTouchEnd(msg)}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    {activeReactionMsg === msg._id && (
                      <div className="reaction-picker">
                        {EMOJIS.map(emoji => (
                          <span 
                            key={emoji} 
                            onClick={(e) => {
                              e.stopPropagation();
                              sendReaction(msg._id, emoji);
                              setActiveReactionMsg(null);
                            }}
                          >
                            {emoji}
                          </span>
                        ))}
                        <span 
                          style={{ borderLeft: '1px solid #8696a0', paddingLeft: '12px', marginLeft: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMessage(msg._id);
                            setActiveReactionMsg(null);
                          }}
                        >
                          🗑️
                        </span>
                      </div>
                    )}
                    {msg.replyTo && (
                      <div className="message-reply">
                        <div className="name">{msg.replyTo.senderName}</div>
                        <div className="text">{msg.replyTo.text.match(/^(IMG::|AUD::|VID::|DOC::)/) ? 'Media attached' : msg.replyTo.text}</div>
                      </div>
                    )}
                    {msg.text.startsWith('IMG::') ? (
                      <img src={msg.text.substring(5)} alt="attachment" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '5px' }} />
                    ) : msg.text.startsWith('AUD::') ? (
                      <audio controls src={msg.text.substring(5)} style={{ width: '250px', height: '40px', marginTop: '5px' }} />
                    ) : msg.text.startsWith('VID::') ? (
                      <video controls src={msg.text.substring(5)} style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '5px' }} />
                    ) : msg.text.startsWith('DOC::') ? (
                      <a href={msg.text.substring(5)} target="_blank" download="document_attachment" style={{ color: '#53bdeb', display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 0' }}><FileText size={20}/> Download Attachment</a>
                    ) : (
                      <p>{msg.text}</p>
                    )}
                    <span className="msg-time">
                      {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
                      {isSentByMe && getTicks(msg.status || 'sent')}
                    </span>
                    {msg.reaction && (
                      <div className="reaction-bubble">{msg.reaction}</div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
              {replyingTo && (
                <div className="replying-to-container">
                  <div className="replying-to-content">
                    <span className="replying-to-name">{(replyingTo.sender?._id || replyingTo.sender) === currentUser._id ? 'You' : activeChat.phoneNumber}</span>
                    <span className="replying-to-text">{replyingTo.text}</span>
                  </div>
                  <X className="close-reply" size={20} onClick={() => setReplyingTo(null)} style={{cursor: 'pointer'}} />
                </div>
              )}
              {showEmojiPicker && (
                <div className="emoji-picker-wrapper" onClick={(e) => e.stopPropagation()}>
                  <EmojiPicker 
                    theme="dark" 
                    onEmojiClick={(e) => setInputMessage(prev => prev + e.emoji)} 
                  />
                </div>
              )}
              {showAttachmentMenu && (
                <div className="attachment-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="attachment-item" onClick={() => galleryRef.current.click()}>
                    <div className="icon-circle"><Image size={24} color="#53bdeb" /></div>
                    <span>Gallery</span>
                  </div>
                  <div className="attachment-item" onClick={() => cameraRef.current.click()}>
                    <div className="icon-circle"><Camera size={24} color="#ff3366" /></div>
                    <span>Camera</span>
                  </div>
                  <div className="attachment-item" onClick={() => setShowAttachmentMenu(false)}>
                    <div className="icon-circle"><MapPin size={24} color="#1fa855" /></div>
                    <span>Location</span>
                  </div>
                  <div className="attachment-item" onClick={() => setShowAttachmentMenu(false)}>
                    <div className="icon-circle"><User size={24} color="#0099ff" /></div>
                    <span>Contact</span>
                  </div>
                  <div className="attachment-item" onClick={() => documentRef.current.click()}>
                    <div className="icon-circle"><FileText size={24} color="#7f66ff" /></div>
                    <span>Document</span>
                  </div>
                  <div className="attachment-item" onClick={() => audioRef.current.click()}>
                    <div className="icon-circle"><Headphones size={24} color="#f96533" /></div>
                    <span>Audio</span>
                  </div>
                  <div className="attachment-item" onClick={() => setShowAttachmentMenu(false)}>
                    <div className="icon-circle"><BarChart2 size={24} color="#ffb300" /></div>
                    <span>Poll</span>
                  </div>
                  <div className="attachment-item" onClick={() => setShowAttachmentMenu(false)}>
                    <div className="icon-circle"><Calendar size={24} color="#ff3366" /></div>
                    <span>Event</span>
                  </div>
                  <div className="attachment-item" onClick={() => setShowAttachmentMenu(false)}>
                    <div className="icon-circle"><Sparkles size={24} color="#53bdeb" /></div>
                    <span>AI images</span>
                  </div>
                  
                  {/* Hidden Inputs */}
                  <input type="file" ref={galleryRef} style={{ display: 'none' }} accept="image/*,video/*" onChange={(e) => handleFileUpload(e, 'Gallery')} />
                  <input type="file" ref={cameraRef} style={{ display: 'none' }} accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, 'Camera')} />
                  <input type="file" ref={documentRef} style={{ display: 'none' }} accept="*" onChange={(e) => handleFileUpload(e, 'Document')} />
                  <input type="file" ref={audioRef} style={{ display: 'none' }} accept="audio/*" onChange={(e) => handleFileUpload(e, 'Audio')} />
                </div>
              )}
              <div className="chat-input-wrapper">
                <div className="input-bar">
                  <Smile size={24} className="icon emoji-icon" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); setShowAttachmentMenu(false); }} />
                  <form onSubmit={sendMessage} className="chat-form">
                    <input
                      type="text"
                      placeholder="Message"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                    />
                  </form>
                  <Paperclip 
                    size={24} 
                    className="icon attachment-icon" 
                    onClick={(e) => { e.stopPropagation(); setShowAttachmentMenu(!showAttachmentMenu); setShowEmojiPicker(false); }} 
                  />
                  {!inputMessage.trim() && <Camera size={24} className="icon camera-icon" onClick={() => cameraRef.current?.click()} />}
                </div>
                <button 
                  className={`voice-send-btn ${inputMessage.trim() ? 'send' : 'voice'} ${isRecording ? 'recording' : ''}`}
                  onClick={(e) => {
                    if (inputMessage.trim()) {
                      sendMessage(e);
                    } else {
                      toggleRecording();
                    }
                  }}
                >
                  {inputMessage.trim() ? <Send size={20} /> : (isRecording ? <StopCircle size={20} color="#ff3366" /> : <Mic size={20} />)}
                </button>
              </div>
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

      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
        >
          <div className="context-menu-item" onClick={(e) => {
            e.stopPropagation();
            setReplyingTo(contextMenu.msg);
            setContextMenu(null);
          }}>
            Reply
          </div>
          <div className="context-menu-item" onClick={(e) => {
             e.stopPropagation();
             setActiveReactionMsg(contextMenu.msg._id);
             setContextMenu(null);
          }}>
            React
          </div>
          <div className="context-menu-item" onClick={(e) => {
             e.stopPropagation();
             deleteMessage(contextMenu.msg._id);
             setContextMenu(null);
          }}>
            Delete
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
