require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const plansRoutes = require('./routes/plans');
const subscriptionRoutes = require('./routes/subscriptions');
const carRoutes = require('./routes/cars');
const eventsRoutes = require('./routes/events'); 
const processorRoutes = require('./routes/processor');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (let interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    
    for (let i = 0; i < networkInterface.length; i++) {
      const alias = networkInterface[i];
      
      if (alias.family === 'IPv4' && 
          !alias.internal && 
          alias.address !== '127.0.0.1' &&
          !alias.address.startsWith('169.254.')) { 
        addresses.push(alias.address);
      }
    }
  }
  
  return addresses;
}

function generateCorsOrigins() {
  const localIPs = getLocalIPAddresses();
  const origins = [
    'http://localhost:19006',
    'http://localhost:19000',
    'http://localhost:8081',
    'http://127.0.0.1:19006',
    'http://127.0.0.1:19000',
    'http://127.0.0.1:8081'
  ];
  
  const ports = [19000, 19006, 8081, 3000];
  
  localIPs.forEach(ip => {
    ports.forEach(port => {
      origins.push(`http://${ip}:${port}`);
    });
    
    const ipParts = ip.split('.');
    if (ipParts.length === 4) {
      const baseIP = ipParts.slice(0, 3).join('\\.');
      origins.push(new RegExp(`^http://${baseIP}\\.\\d+:(19000|19006|8081|3000)$`));
      origins.push(new RegExp(`^exp://${baseIP}\\.\\d+`));
    }
  });
  
  origins.push(
    /^https:\/\/.*\.exp\.direct/,
    /^https:\/\/.*\.ngrok\.io/,
    /^https:\/\/.*\.tunnelmole\.com/,
    /^https:\/\/.*\.localtunnel\.me/
  );
  
  return origins;
}

const localIPs = getLocalIPAddresses();
console.log('Detected local IP addresses:', localIPs);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: generateCorsOrigins(),
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(helmet());

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

const corsOptions = {
  origin: generateCorsOrigins(),
  credentials: true,
  optionsSuccessStatus: 200
};

console.log('🔧 CORS configured for origins:', corsOptions.origin);
app.use(cors(corsOptions));

app.use(morgan('combined'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/cars', carRoutes);
app.use('/api', eventsRoutes); 
app.use('/api/processor', processorRoutes);

app.get('/api/health', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./config/supabase');
    
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('count')
      .limit(1);
    
    res.status(200).json({
      success: true,
      status: 'OK',
      message: 'ABA-DAMIDEQI Backend is running',
      database: error ? 'Error' : 'Connected',
      socketIO: 'Active',
      localIPs: localIPs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/network-info', (req, res) => {
  res.status(200).json({
    success: true,
    localIPs: getLocalIPAddresses(),
    corsOrigins: generateCorsOrigins(),
    requestOrigin: req.get('origin'),
    requestHost: req.get('host'),
    timestamp: new Date().toISOString()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Join chat room
  socket.on('chat:join', ({ conversationId }) => {
    if (conversationId) {
      socket.join(`chat:${conversationId}`);
      console.log(`👥 Socket ${socket.id} joined chat:${conversationId}`);
    }
  });

  // Leave chat room
  socket.on('chat:leave', ({ conversationId }) => {
    if (conversationId) {
      socket.leave(`chat:${conversationId}`);
      console.log(`👋 Socket ${socket.id} left chat:${conversationId}`);
    }
  });

  // Handle chat messages
  socket.on('chat:message', ({ conversationId, content, fromUserId }) => {
    if (conversationId && content) {
      // Broadcast to all users in this conversation room
      socket.to(`chat:${conversationId}`).emit('chat:message', {
        id: Date.now().toString(),
        conversationId,
        content,
        fromUserId,
        created_at: new Date().toISOString()
      });
      console.log(`💬 Message broadcasted to chat:${conversationId}`);
    }
  });

  // Handle typing indicators
  socket.on('chat:typing', ({ conversationId, username, isTyping }) => {
    socket.to(`chat:${conversationId}`).emit('chat:typing', {
      username,
      isTyping
    });
  });

  // Handle user status updates
  socket.on('user:status', ({ status }) => {
    socket.broadcast.emit('user:status', {
      userId: socket.userId,
      status,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.IO server active`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: Supabase`);
  console.log(`🌐 Local IP addresses: ${localIPs.join(', ')}`);
  console.log(`🔗 Access URLs:`);
  
  console.log(`   - http://localhost:${PORT}`);
  localIPs.forEach(ip => {
    console.log(`   - http://${ip}:${PORT}`);
  });
  
  console.log(`✅ CORS enabled for automatic IP detection`);
});