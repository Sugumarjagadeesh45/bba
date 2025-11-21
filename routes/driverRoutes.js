const express = require("express");
const router = express.Router();
const driverController = require("../controllers/driver/driverController");
const { authMiddleware } = require("../middleware/authMiddleware");

// Debug controller methods
console.log('🚗 Driver Controller Methods:', Object.keys(driverController).filter(key => typeof driverController[key] === 'function'));

// Public routes
router.post("/login", (req, res) => {
  driverController.loginDriver(req, res);
});

router.post("/change-password", (req, res) => {
  driverController.changePassword(req, res);
});

// Test driver creation (public for testing)
router.post("/create-test-driver", (req, res) => {
  driverController.createDriver(req, res);
});

// Token verification (protected)
router.get("/verify", authMiddleware, (req, res) => {
  driverController.verifyDriver(req, res);
});

// Protected routes (require authentication)
router.use(authMiddleware);

// Make sure this route exists and is properly mounted
router.post("/update-fcm-token", (req, res) => {
  driverController.updateFCMToken(req, res);
});

router.post("/test-notification", (req, res) => {
  driverController.sendTestNotification(req, res);
});

// Location management
router.post("/update-location", (req, res) => {
  driverController.updateLocation(req, res);
});

// Nearby drivers (public for users)
router.get("/nearby", (req, res) => {
  // This should be in a separate controller, but keeping for compatibility
  const Driver = require("../models/driver/driver");
  
  const { latitude, longitude, maxDistance = 5000 } = req.query;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ 
      success: false,
      message: "Latitude and longitude are required" 
    });
  }

  Driver.find({
    status: "Live",
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
        $maxDistance: parseInt(maxDistance),
      },
    },
  })
  .select("driverId name location vehicleType status")
  .then(drivers => {
    res.json({
      success: true,
      count: drivers.length,
      drivers,
    });
  })
  .catch(err => {
    console.error("❌ Error fetching nearby drivers:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch nearby drivers",
      error: err.message 
    });
  });
});

// Ride operations
router.get("/rides/:rideId", (req, res) => {
  driverController.getRideById(req, res);
});

router.put("/rides/:rideId", (req, res) => {
  driverController.updateRideStatus(req, res);
});

// Driver management
router.get("/", (req, res) => {
  driverController.getDrivers(req, res);
});

router.get("/nearest", (req, res) => {
  driverController.getNearestDrivers(req, res);
});

router.put("/:driverId", (req, res) => {
  driverController.updateDriver(req, res);
});

router.delete("/:driverId", (req, res) => {
  driverController.deleteDriver(req, res);
});

router.post("/logout", (req, res) => {
  driverController.logoutDriver(req, res);
});

// DriverRoutes.js-ல் இந்த route add பண்ணு
router.post('/update-fcm-token', async (req, res) => {
  try {
    const { driverId, fcmToken, platform } = req.body;
    
    console.log('🔄 FCM Token Update:', { 
      driverId, 
      tokenLength: fcmToken?.length 
    });

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      { 
        fcmToken: fcmToken,
        platform: platform || 'android',
        lastUpdate: new Date()
      },
      { new: true }
    );

    res.json({ success: true, message: 'FCM token updated' });
  } catch (error) {
    console.error('FCM token update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
