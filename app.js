require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");

// ✅ INITIALIZE APP
const app = express();

// ✅ MIDDLEWARE
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);




// In /Users/webasebrandings/Downloads/wsback-main/app.js



// ✅ HELPER: Safe Route Loader
function safeRequireRoute(relPath, name = "Route") {
  const fullPath = path.join(__dirname, relPath);
  console.log(`Loading ${name} route from: ${fullPath}`);

  const candidates = [
    `${fullPath}.js`,
    fullPath,
    path.join(fullPath, "index.js"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`Found ${name} route: ${c}`);
      try {
        const module = require(c);
        if (typeof module === "function" || module instanceof express.Router) return module;
        if (module && module.router) return module.router;
        if (module && module.default) return module.default;
      } catch (err) {
        console.error(`Failed to load ${name} route:`, err.message);
      }
      break;
    }
  }

  console.warn(`'${name}' route not found or invalid → skipping`);
  return express.Router();
}

// ✅ UPLOADS DIRECTORY & STATIC SERVING
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Created uploads directory:", uploadsDir);
}

app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  express.static(uploadsDir)(req, res, next);
});

console.log("Static files served from /uploads");

// ✅ MODELS (only import once)
const Registration = require("./models/user/Registration");
const Counter = require("./models/user/customerId");
const Driver = require("./models/driver/driver");
const Ride = require("./models/ride");

// ✅ DIRECT AUTH ROUTES (Working & Clean)
app.post("/api/auth/verify-phone", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });

    const user = await Registration.findOne({ phoneNumber });
    if (user) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });
      return res.json({
        success: true,
        token,
        user: {
          name: user.name,
          phoneNumber: user.phoneNumber,
          customerId: user.customerId,
          profilePicture: user.profilePicture || ""
        }
      });
    }
    res.json({ success: true, newUser: true });
  } catch (err) {
    console.error("verify-phone error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;
    if (!name || !phoneNumber || !address)
      return res.status(400).json({ error: "Name, phone number, and address are required" });

    const existing = await Registration.findOne({ phoneNumber });
    if (existing) return res.status(400).json({ error: "Phone number already registered" });

    const counter = await Counter.findOneAndUpdate(
      { _id: "customerId" },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    const customerId = (100000 + counter.sequence).toString();

    const newUser = new Registration({ name, phoneNumber, address, customerId });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });

    res.status(201).json({
      success: true,
      token,
      user: { name, phoneNumber, address, customerId }
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ WALLET & PROFILE (Protected)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "secret", (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
};

app.get("/api/wallet", authenticateToken, async (req, res) => {
  try {
    const user = await Registration.findById(req.userId);
    res.json({ success: true, wallet: user?.wallet || 0, balance: user?.wallet || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const user = await Registration.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const backendUrl = process.env.BACKEND_URL || "http://localhost:5001";
    const profilePicture = user.profilePicture
      ? user.profilePicture.startsWith("http")
        ? user.profilePicture
        : `${backendUrl}${user.profilePicture}`
      : "";

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name || "",
        phoneNumber: user.phoneNumber || "",
        customerId: user.customerId || "",
        email: user.email || "",
        address: user.address || "",
        profilePicture,
        gender: user.gender || "",
        dob: user.dob || "",
        altMobile: user.altMobile || "",
        wallet: user.wallet || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ FCM TOKEN UPDATE (Multiple endpoints for compatibility)
app.post(["/drivers/update-fcm-token", "/register-fcm-token", "/api/drivers/update-fcm-token"], async (req, res) => {
  try {
    const { driverId, fcmToken, platform = "android" } = req.body;
    if (!driverId || !fcmToken) return res.status(400).json({ success: false, error: "driverId & fcmToken required" });

    const updated = await Driver.findOneAndUpdate(
      { driverId },
      { fcmToken, platform, lastUpdate: new Date(), notificationEnabled: true, status: "Live" },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, error: "Driver not found" });

    res.json({
      success: true,
      message: "FCM token updated",
      driverId,
      name: updated.name
    });
  } catch (err) {
    console.error("FCM update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ TEST ENDPOINTS
app.get("/api/test-connection", (req, res) => res.json({ success: true, message: "API is live!", timestamp: new Date() }));

app.get("/api/auth/test", (req, res) => res.json({ success: true, message: "Direct auth routes working!" }));

app.post("/api/test/accept-ride", async (req, res) => {
  try {
    const { rideId, driverId = "dri123", driverName = "Test Driver" } = req.body;
    const ride = await Ride.findOne({ RAID_ID: rideId });
    if (!ride) return res.status(404).json({ error: "Ride not found" });

    const io = req.app.get("io");
    if (!io) return res.status(500).json({ error: "Socket.io not initialized" });

    const testData = {
      rideId,
      driverId,
      driverName,
      driverMobile: "9876543210",
      driverLat: 11.331288,
      driverLng: 77.716728,
      vehicleType: "taxi",
      timestamp: new Date().toISOString(),
      _isTest: true
    };

    io.to(ride.user.toString()).emit("rideAccepted", testData);
    res.json({ success: true, message: "Test ride acceptance sent", userId: ride.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/test-driver-status", async (req, res) => {
  const driver = await Driver.findOne({ driverId: "dri123" });
  res.json({
    driverExists: !!driver,
    hasFcmToken: !!driver?.fcmToken,
    isOnline: driver?.isOnline,
    driverInfo: driver ? { name: driver.name, status: driver.status } : null
  });
});

app.get("/api/test-uploads", (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({ success: true, uploadsDir, files: files.slice(0, 10), count: files.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ ADMIN DASHBOARD (Mock Data)
app.get("/api/admin/dashboard-data", (req, res) => {
  res.json({
    success: true,
    data: {
      stats: { totalUsers: 63154, usersChange: "+12.5%", drivers: 1842, driversChange: "+8.2%", totalRides: 24563, ridesChange: "+15.3%", productSales: 48254, salesChange: "+22.1%" },
      weeklyPerformance: [
        { name: "Mon", rides: 45, orders: 32 }, { name: "Tue", rides: 52, orders: 38 },
        { name: "Wed", rides: 48, orders: 41 }, { name: "Thu", rides: 60, orders: 45 },
        { name: "Fri", rides: 75, orders: 52 }, { name: "Sat", rides: 82, orders: 61 },
        { name: "Sun", rides: 68, orders: 48 }
      ],
      serviceDistribution: [{ name: "Rides", value: 65 }, { name: "Grocery", value: 35 }]
    }
  });
});



// In /Users/webasebrandings/Downloads/wsback-main/app.js

// ✅ LOAD & MOUNT ROUTES (Safe + No Duplicates)
console.log("Loading and mounting routes...");

const adminRoutes = safeRequireRoute("./routes/adminRoutes", "Admin");
const driverRoutes = safeRequireRoute("./routes/driverRoutes", "Driver");
const rideRoutes = safeRequireRoute("./routes/rideRoutes", "Ride");
const groceryRoutes = safeRequireRoute("./routes/groceryRoutes", "Grocery");
const authRoutes = safeRequireRoute("./routes/authRoutes", "Auth");
const userRoutes = safeRequireRoute("./routes/userRoutes", "User");
const walletRoutes = safeRequireRoute("./routes/walletRoutes", "Wallet");
const routeRoutes = safeRequireRoute("./routes/routeRoutes", "Route");
const ridePriceRoutes = safeRequireRoute("./routes/ridePriceRoutes", "Ride Price");
const driverLocationHistoryRoutes = safeRequireRoute("./routes/driverLocationHistoryRoutes", "Driver Location History");
const testRoutes = safeRequireRoute("./routes/testRoutes", "Test");
const notificationRoutes = safeRequireRoute("./routes/notificationRoutes", "Notification");
const bannerRoutes = safeRequireRoute("./routes/Banner", "Banner");

// ✅ ADD ORDER ROUTES - FIXED PATH
const orderRoutes = safeRequireRoute("./routes/orderRoutes", "Order");

app.use("/api/admin", adminRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/groceries", groceryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/admin/ride-prices", ridePriceRoutes);
app.use("/api", driverLocationHistoryRoutes);
app.use("/api/test", testRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/banners", bannerRoutes);

// ✅ MOUNT ORDER ROUTES - ADD THIS LINE
app.use("/api/orders", orderRoutes);

console.log("All routes mounted successfully!");


// ✅ ROOT & HEALTH
app.get("/", (req, res) => {
  res.json({ message: "Taxi + Grocery App API Running", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ✅ ERROR HANDLER (Last)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(err.status || 500).json({
    error: { message: err.message || "Internal Server Error" }
  });
});

// ✅ EXPORT
module.exports = app;


// require("dotenv").config();

// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// const fs = require("fs");
// const morgan = require("morgan");

// // ✅ INITIALIZE APP FIRST
// const app = express();

// // ✅ MIDDLEWARE SETUP - AFTER APP INITIALIZATION
// app.use(morgan("dev"));
// app.use(express.json()); // Parse JSON bodies
// app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
// app.use(
//   cors({
//     origin: "*",
//     methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );



// // Add this after other middleware
// const adminRoutes = require('./routes/adminRoutes');

// // Mount admin routes
// app.use('/api/admin', adminRoutes);

// console.log('✅ Admin routes mounted at /api/admin');



// const Driver = require('./models/driver/driver');
// const bannerRoutes = safeRequireRoute("./routes/Banner", "Banner");

// // Debug route loading
// console.log("🔄 Loading and mounting routes...");

// // Debug middleware
// app.use('/api/debug', (req, res, next) => {
//   console.log('🔍 Incoming request:', req.method, req.originalUrl);
//   next();
// });

// // Simple test route
// app.get('/api/simple-test', (req, res) => {
//   res.json({ 
//     success: true, 
//     message: 'Basic API is working',
//     timestamp: new Date().toISOString()
//   });
// });

// // In app.js, replace the existing static file serving code with this:

// /* ---------- Uploads directory (static) ---------- */
// const uploadsDir = path.join(__dirname, "uploads");
// try {
//   if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir, { recursive: true });
//     console.log("✅ Created uploads directory:", uploadsDir);
//   }
// } catch (err) {
//   console.warn("⚠️ Could not ensure uploads directory:", err.message);
// }

// // Serve static files from uploads directory with proper headers
// app.use("/uploads", (req, res, next) => {
//   // Set proper headers for images
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
//   // Continue to static file serving
//   express.static(path.join(__dirname, "uploads"))(req, res, next);
// });

// console.log("✅ Static files configured for /uploads directory");

// // Add this route to test if uploads are accessible
// app.get('/api/test-uploads', (req, res) => {
//   const fs = require('fs');
//   const path = require('path');
//   const uploadsDir = path.join(__dirname, 'uploads');
  
//   try {
//     const files = fs.readdirSync(uploadsDir);
//     res.json({
//       success: true,
//       uploadsDir,
//       files: files.slice(0, 10), // Return first 10 files
//       count: files.length
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       uploadsDir
//     });
//   }
// });
// // Direct auth routes - no separate file needed
// app.post('/api/auth/verify-phone', async (req, res) => {
//   try {
//     console.log('✅ DIRECT /api/auth/verify-phone route hit!');
//     console.log('📦 Request body:', req.body);
    
//     const { phoneNumber } = req.body;
    
//     if (!phoneNumber) {
//       return res.status(400).json({ error: 'Phone number is required' });
//     }

//     console.log('📞 Phone verification request for:', phoneNumber);
    
//     // Check if user exists
//     const Registration = require('./models/user/Registration');
//     const user = await Registration.findOne({ phoneNumber });
    
//     if (user) {
//       const jwt = require('jsonwebtoken');
//       const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', {
//         expiresIn: '30d',
//       });
      
//       return res.json({ 
//         success: true, 
//         token,
//         user: { 
//           name: user.name, 
//           phoneNumber: user.phoneNumber, 
//           customerId: user.customerId, 
//           profilePicture: user.profilePicture || ''
//         }
//       });
//     }
    
//     return res.json({ success: true, newUser: true });
    
//   } catch (err) {
//     console.error('❌ Error in verify-phone:', err);
//     res.status(500).json({ error: err.message });
//   }
// });

// app.post('/api/auth/register', async (req, res) => {
//   try {
//     console.log('✅ DIRECT /api/auth/register route hit!');
//     const { name, phoneNumber, address } = req.body;

//     if (!name || !phoneNumber || !address) {
//       return res.status(400).json({ error: 'Name, phone number, and address are required' });
//     }

//     const Registration = require('./models/user/Registration');
//     const Counter = require('./models/user/customerId');
    
//     // Check if user already exists
//     const existingUser = await Registration.findOne({ phoneNumber });
//     if (existingUser) {
//       return res.status(400).json({ error: 'Phone number already registered' });
//     }

//     // Generate customer ID
//     const counter = await Counter.findOneAndUpdate(
//       { _id: 'customerId' },
//       { $inc: { sequence: 1 } },
//       { new: true, upsert: true }
//     );
//     const customerId = (100000 + counter.sequence).toString();

//     // Create new user
//     const newUser = new Registration({
//       name,
//       phoneNumber,
//       address,
//       customerId
//     });

//     await newUser.save();
//     console.log('✅ New user registered:', customerId);

//     // Generate token
//     const jwt = require('jsonwebtoken');
//     const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'secret', {
//       expiresIn: '30d',
//     });

//     res.status(201).json({
//       success: true,
//       token,
//       user: { 
//         name: newUser.name, 
//         phoneNumber: newUser.phoneNumber, 
//         address: newUser.address, 
//         customerId: newUser.customerId 
//       }
//     });
//   } catch (err) {
//     console.error('❌ Error in register:', err);
//     res.status(400).json({ error: err.message });
//   }
// });

// app.get('/api/auth/test', (req, res) => {
//   console.log('✅ DIRECT /api/auth/test route hit!');
//   res.json({ 
//     success: true,
//     message: 'Direct auth routes are working!',
//     endpoints: [
//       'POST /api/auth/verify-phone',
//       'POST /api/auth/register', 
//       'GET /api/auth/test'
//     ],
//     timestamp: new Date().toISOString()
//   });
// });

// console.log("✅ Direct auth routes added successfully!");
// /* ========== END DIRECT AUTH ROUTES ========== */

// // Direct wallet route
// app.get('/api/wallet', async (req, res) => {
//   try {
//     console.log('✅ DIRECT /api/wallet route hit!');
    
//     // Get token from header
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       return res.status(401).json({ error: 'No token provided' });
//     }
    
//     const token = authHeader.split(' ')[1];
//     const jwt = require('jsonwebtoken');
//     const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
//     console.log('🔍 User ID from token for wallet:', decoded.id);
    
//     const Registration = require('./models/user/Registration');
//     const user = await Registration.findById(decoded.id);
    
//     if (!user) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'User not found' 
//       });
//     }
    
//     console.log('💰 Wallet balance for', user.name + ':', user.wallet || 0);
    
//     res.json({
//       success: true,
//       wallet: user.wallet || 0,
//       balance: user.wallet || 0
//     });
    
//   } catch (err) {
//     console.error('❌ Error in /api/wallet:', err);
//     if (err.name === 'JsonWebTokenError') {
//       return res.status(401).json({ error: 'Invalid token' });
//     }
//     res.status(500).json({ error: err.message });
//   }
// });

// // Direct profile route
// app.get('/api/users/profile', async (req, res) => {
//   try {
//     console.log('✅ DIRECT /api/users/profile route hit!');
    
//     // Get token from header
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       return res.status(401).json({ error: 'No token provided' });
//     }
    
//     const token = authHeader.split(' ')[1];
//     const jwt = require('jsonwebtoken');
//     const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
//     console.log('🔍 User ID from token:', decoded.id);
    
//     const Registration = require('./models/user/Registration');
//     const user = await Registration.findById(decoded.id);
    
//     if (!user) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'User not found' 
//       });
//     }
    
//     // Build profile picture URL
//     let profilePictureUrl = '';
//     if (user.profilePicture) {
//       const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
//       profilePictureUrl = user.profilePicture.startsWith('http') 
//         ? user.profilePicture 
//         : `${backendUrl}${user.profilePicture}`;
//     }
    
//     const userData = {
//       _id: user._id,
//       name: user.name || '',
//       phoneNumber: user.phoneNumber || '',
//       customerId: user.customerId || '',
//       email: user.email || '',
//       address: user.address || '',
//       profilePicture: profilePictureUrl,
//       gender: user.gender || '',
//       dob: user.dob || '',
//       altMobile: user.altMobile || '',
//       wallet: user.wallet || 0
//     };
    
//     console.log('✅ Sending user profile data for:', user.name);
    
//     res.json({
//       success: true,
//       user: userData
//     });
    
//   } catch (err) {
//     console.error('❌ Error in /api/users/profile:', err);
//     if (err.name === 'JsonWebTokenError') {
//       return res.status(401).json({ error: 'Invalid token' });
//     }
//     res.status(500).json({ error: err.message });
//   }
// });

// // Test ride acceptance endpoint
// app.post('/api/test/accept-ride', async (req, res) => {
//   try {
//     const { rideId, driverId, driverName } = req.body;
    
//     console.log('🧪 TEST: Manual ride acceptance');
//     console.log('📦 Test data:', { rideId, driverId, driverName });
    
//     const io = req.app.get('io');
//     if (!io) {
//       return res.status(500).json({ error: 'Socket.io not available' });
//     }

//     // Find the actual ride to get user ID
//     const Ride = require('./models/ride');
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (!ride) {
//       return res.status(404).json({ error: 'Ride not found' });
//     }

//     const userId = ride.user.toString();
//     console.log(`🧪 Sending test acceptance to user: ${userId}`);
    
//     // Create complete test data
//     const testData = {
//       rideId: rideId,
//       driverId: driverId || 'dri123',
//       driverName: driverName || 'Test Driver',
//       driverMobile: '9876543210',
//       driverLat: 11.331288,
//       driverLng: 77.716728,
//       vehicleType: 'taxi',
//       timestamp: new Date().toISOString(),
//       _isTest: true
//     };

//     // Send to user
//     io.to(userId).emit("rideAccepted", testData);
    
//     res.json({ 
//       success: true, 
//       message: 'Test acceptance sent',
//       data: testData,
//       userId: userId
//     });
    
//   } catch (error) {
//     console.error('❌ Test error:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // FCM token endpoints
// app.post('/drivers/update-fcm-token', async (req, res) => {
//   try {
//     const { driverId, fcmToken, platform } = req.body;
    
//     console.log('📱 FCM Token Update Request:', { 
//       driverId, 
//       tokenLength: fcmToken?.length,
//       tokenPrefix: fcmToken ? fcmToken.substring(0, 10) : 'NULL',
//       platform 
//     });

//     if (!driverId || !fcmToken) {
//       return res.status(400).json({
//         success: false,
//         error: 'Driver ID and FCM token are required'
//       });
//     }

//     // Validate FCM token format
//     if (fcmToken.length < 10) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid FCM token format'
//       });
//     }

//     const Driver = require('./models/driver/driver');

//     // Check if driver exists first
//     const existingDriver = await Driver.findOne({ driverId: driverId });
//     if (!existingDriver) {
//       console.log(`❌ Driver not found: ${driverId}`);
//       return res.status(404).json({
//         success: false,
//         error: 'Driver not found. Please create driver first.'
//       });
//     }

//     console.log(`✅ Driver found: ${existingDriver.name}`);
//     console.log(`📊 Previous FCM token: ${existingDriver.fcmToken ? 'EXISTS' : 'NULL'}`);

//     // Update driver with FCM token
//     const updatedDriver = await Driver.findOneAndUpdate(
//       { driverId: driverId },
//       { 
//         fcmToken: fcmToken,
//         platform: platform || 'android',
//         lastUpdate: new Date(),
//         notificationEnabled: true,
//         status: "Live"
//       },
//       { new: true }
//     );

//     console.log('✅ FCM token updated successfully for driver:', driverId);
//     console.log('✅ New FCM token stored in database');
    
//     res.json({
//       success: true,
//       message: 'FCM token registered successfully',
//       driverId: updatedDriver.driverId,
//       name: updatedDriver.name,
//       tokenUpdated: true,
//       tokenPreview: `${fcmToken.substring(0, 15)}...`,
//       tokenLength: fcmToken.length
//     });

//   } catch (error) {
//     console.error('❌ Error updating FCM token:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// app.post('/register-fcm-token', async (req, res) => {
//   try {
//     const { driverId, fcmToken, platform, appVersion } = req.body;
    
//     console.log('📱 FCM Token Registration Request:', { 
//       driverId, 
//       tokenLength: fcmToken?.length,
//       platform 
//     });

//     if (!driverId || !fcmToken) {
//       return res.status(400).json({
//         success: false,
//         error: 'Driver ID and FCM token are required'
//       });
//     }

//     // Check if driver exists
//     const driver = await Driver.findOne({ driverId: driverId });
//     if (!driver) {
//       console.log(`❌ Driver not found: ${driverId}`);
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Driver not found' 
//       });
//     }

//     console.log(`✅ Driver found: ${driver.name}`);

//     // Update FCM token
//     driver.fcmToken = fcmToken;
//     driver.platform = platform || 'android';
//     driver.lastUpdate = new Date();
//     driver.notificationEnabled = true;
    
//     await driver.save();
    
//     console.log(`✅ FCM token updated for driver: ${driverId}`);
    
//     res.json({ 
//       success: true,
//       message: 'FCM token registered successfully',
//       driverId: driverId,
//       name: driver.name
//     });
//   } catch (error) {
//     console.error('❌ FCM registration error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message 
//     });
//   }
// });

// // Test driver status endpoint
// app.get('/api/test-driver-status', async (req, res) => {
//   try {
//     // Check if driver exists with any FCM token
//     const driver = await Driver.findOne({ driverId: 'dri123' });
    
//     res.json({
//       driverExists: !!driver,
//       hasFcmToken: driver && !!driver.fcmToken,
//       isOnline: driver && driver.isOnline,
//       driverInfo: driver ? {
//         id: driver._id,
//         name: driver.name,
//         fcmTokenLength: driver.fcmToken ? driver.fcmToken.length : 0
//       } : null
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // API FCM token endpoint
// app.post('/api/drivers/update-fcm-token', async (req, res) => {
//   try {
//     const { driverId, fcmToken, platform, appVersion } = req.body;
    
//     console.log('📱 Updating FCM token for driver:', driverId);
//     console.log('🔑 Token received:', fcmToken ? `${fcmToken.substring(0, 20)}...` : 'NULL');
//     console.log('📱 Platform:', platform);

//     if (!driverId || !fcmToken) {
//       return res.status(400).json({
//         success: false,
//         error: 'Driver ID and FCM token are required'
//       });
//     }

//     // Update driver in database using driverId field
//     const driver = await Driver.findOneAndUpdate(
//       { driverId: driverId }, // Match by driverId field
//       { 
//         fcmToken: fcmToken,
//         platform: platform || 'android',
//         lastUpdate: new Date(),
//         notificationEnabled: true,
//         status: "Live" // Keep driver online
//       },
//       { new: true, upsert: false }
//     );

//     if (!driver) {
//       return res.status(404).json({
//         success: false,
//         error: 'Driver not found'
//       });
//     }

//     console.log('✅ FCM token updated for driver:', driverId);
    
//     res.json({
//       success: true,
//       message: 'FCM token updated successfully',
//       driverId: driverId,
//       tokenUpdated: true,
//       tokenPreview: `${fcmToken.substring(0, 15)}...`
//     });

//   } catch (error) {
//     console.error('❌ Error updating FCM token:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// /* ---------- Helper: safeRequireRoute ---------- */
// function safeRequireRoute(relPath, name = "Route") {
//   const fullPath = path.join(__dirname, relPath);
//   console.log(`🔍 Loading ${name} route from: ${fullPath}`);
  
//   try {
//     // Try known file extensions
//     const candidates = [
//       `${fullPath}.js`,
//       fullPath,
//       path.join(fullPath, "index.js"),
//     ];

//     let found = null;
//     for (const c of candidates) {
//       if (fs.existsSync(c)) {
//         found = c;
//         console.log(`✅ Found ${name} route file: ${c}`);
//         break;
//       }
//     }

//     if (!found) {
//       console.warn(`⚠️ ${name} route file not found at "${relPath}" (skipping)`);
//       return express.Router();
//     }

//     console.log(`📦 Requiring ${name} route module from: ${found}`);
//     const routeModule = require(found);

//     // If the module itself is a function (router factory) or router, return it
//     if (typeof routeModule === "function" || routeModule instanceof express.Router) {
//       console.log(`✅ Loaded ${name} route from "${relPath}"`);
//       return routeModule;
//     }

//     // If module exports an object with default or router property, try to return it
//     if (routeModule && routeModule.router) {
//       console.log(`✅ Loaded ${name} route (router property) from "${relPath}"`);
//       return routeModule.router;
//     }
//     if (routeModule && routeModule.default) {
//       console.log(`✅ Loaded ${name} route (default export) from "${relPath}"`);
//       return routeModule.default;
//     }

//     // If it exports an object but not a router, warn and return empty router
//     console.warn(
//       `⚠️ ${name} route module at "${relPath}" did not export an Express router/function. Returning empty router.`
//     );
//     return express.Router();
//   } catch (err) {
//     console.error(`❌ Failed to load ${name} route from "${relPath}":`, err.message);
//     // Return a no-op router so server can start
//     return express.Router();
//   }
// }

// /* ---------- Load routes safely ---------- */
// console.log("🔄 Loading routes...");



// // Add this to app.js before other routes
// app.get('/api/admin/dashboard-data', (req, res) => {
//   console.log('✅ Dashboard data route hit!');
//   res.json({
//     success: true,
//     data: {
//       stats: {
//         totalUsers: 63154,
//         usersChange: "+12.5%",
//         drivers: 1842,
//         driversChange: "+8.2%", 
//         totalRides: 24563,
//         ridesChange: "+15.3%",
//         productSales: 48254,
//         salesChange: "+22.1%"
//       },
//       weeklyPerformance: [
//         { name: 'Mon', rides: 45, orders: 32 },
//         { name: 'Tue', rides: 52, orders: 38 },
//         { name: 'Wed', rides: 48, orders: 41 },
//         { name: 'Thu', rides: 60, orders: 45 },
//         { name: 'Fri', rides: 75, orders: 52 },
//         { name: 'Sat', rides: 82, orders: 61 },
//         { name: 'Sun', rides: 68, orders: 48 }
//       ],
//       yearlyTrends: [
//         { month: 'Jan', rides: 1200, orders: 850 },
//         { month: 'Feb', rides: 1350, orders: 920 },
//         { month: 'Mar', rides: 1420, orders: 980 },
//         { month: 'Apr', rides: 1280, orders: 870 },
//         { month: 'May', rides: 1560, orders: 1100 },
//         { month: 'Jun', rides: 1680, orders: 1250 },
//         { month: 'Jul', rides: 1750, orders: 1320 },
//         { month: 'Aug', rides: 1820, orders: 1400 },
//         { month: 'Sep', rides: 1650, orders: 1280 },
//         { month: 'Oct', rides: 1580, orders: 1200 },
//         { month: 'Nov', rides: 1720, orders: 1350 },
//         { month: 'Dec', rides: 1950, orders: 1520 }
//       ],
//       serviceDistribution: [
//         { name: 'Rides', value: 65, color: '#6366f1' },
//         { name: 'Grocery', value: 35, color: '#8b5cf6' }
//       ],
//       recentActivities: [
//         {
//           type: 'ride',
//           title: 'New ride booked',
//           description: 'John Doe booked a ride from Downtown to Airport',
//           timeAgo: '2 minutes ago',
//           icon: 'ride'
//         },
//         {
//           type: 'order', 
//           title: 'New order placed',
//           description: 'Jane Smith placed an order for groceries',
//           timeAgo: '5 minutes ago',
//           icon: 'grocery'
//         }
//       ],
//       salesDistribution: { riders: 65, grocery: 35 }
//     }
//   });
// });




// const driverRoutes = safeRequireRoute("./routes/driverRoutes", "Driver");
// const rideRoutes = safeRequireRoute("./routes/rideRoutes", "Ride");
// const groceryRoutes = safeRequireRoute("./routes/groceryRoutes", "Grocery");
// const authRoutes = safeRequireRoute("./routes/authRoutes", "Auth");
// const userRoutes = safeRequireRoute("./routes/userRoutes", "User");
// const walletRoutes = safeRequireRoute("./routes/walletRoutes", "Wallet");
// const routeRoutes = safeRequireRoute("./routes/routeRoutes", "Route");
// const ridePriceRoutes = safeRequireRoute("./routes/ridePriceRoutes", "Ride Price");
// const driverLocationHistoryRoutes = safeRequireRoute("./routes/driverLocationHistoryRoutes", "Driver Location History");
// const testRoutes = safeRequireRoute("./routes/testRoutes", "Test");
// const notificationRoutes = safeRequireRoute("./routes/notificationRoutes", "Notification");

// /* ---------- Mount routes (only once, consistent paths) ---------- */
// console.log("📡 Mounting routes...");

// app.use("/api/admin", adminRoutes);
// console.log("✅ Mounted /api/admin routes");

// app.use("/api/drivers", driverRoutes);
// console.log("✅ Mounted /api/drivers routes");

// app.use("/api/routes", routeRoutes);
// console.log("✅ Mounted /api/routes routes");

// app.use("/api/rides", rideRoutes);
// console.log("✅ Mounted /api/rides routes");

// app.use("/api/groceries", groceryRoutes);
// console.log("✅ Mounted /api/groceries routes");

// app.use("/api/auth", authRoutes);
// console.log("✅ Mounted /api/auth routes");

// app.use("/api/users", userRoutes);
// console.log("✅ Mounted /api/users routes");

// app.use("/api/wallet", walletRoutes);
// console.log("✅ Mounted /api/wallet routes");

// app.use("/api/admin/ride-prices", ridePriceRoutes);
// console.log("✅ Mounted /api/admin/ride-prices routes");

// app.use("/api", driverLocationHistoryRoutes);
// console.log("✅ Mounted /api driver location history routes");

// app.use("/api/test", testRoutes);
// console.log("✅ Mounted /api/test routes");

// app.use("/api/notifications", notificationRoutes);
// console.log("✅ Mounted /api/notifications routes");

// app.use("/api/banners", bannerRoutes);
// console.log("✅ Mounted /api/banners routes");

// console.log("🎉 All routes mounted successfully!");

// /* ---------- Test routes ---------- */
// app.get("/api/test-connection", (req, res) => {
//   res.json({ 
//     success: true, 
//     message: "Server is running and routes are updated!",
//     timestamp: new Date().toISOString()
//   });
// });

// app.get("/api/direct-test", (req, res) => {
//   const Driver = require('./models/driver/driver');
  
//   Driver.findOne({ driverId: 'dri123' })
//     .then(driver => {
//       res.json({
//         success: true,
//         message: 'Direct test route working!',
//         driver: driver ? {
//           driverId: driver.driverId,
//           name: driver.name,
//           hasFCMToken: !!driver.fcmToken,
//           fcmToken: driver.fcmToken ? `${driver.fcmToken.substring(0, 20)}...` : 'NULL',
//           status: driver.status,
//           lastUpdate: driver.lastUpdate
//         } : null
//       });
//     })
//     .catch(error => {
//       res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     });
// });

// /* ---------- Health / root route ---------- */
// app.get("/", (req, res) => {
//   res.json({ 
//     message: "Taxi app API is running", 
//     uptime: process.uptime(),
//     timestamp: new Date().toISOString()
//   });
// });

// /* ---------- Error handler (last) ---------- */
// app.use((err, req, res, next) => {
//   console.error("❌ Unhandled error:", err.stack || err);
//   const status = err.status || 500;
//   res.status(status).json({
//     error: {
//       message: err.message || "Internal Server Error",
//       stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
//     },
//   });
// });

// /* ---------- Export app ---------- */
// module.exports = app;