const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    email: { type: String, default: '' },
    dob: { type: Date, default: null },
    licenseNumber: { type: String, required: true, unique: true },
    aadharNumber: { type: String, required: true, unique: true },
    bankAccountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    licenseDocument: { type: String, default: '' },
    aadharDocument: { type: String, default: '' },

    status: { type: String, enum: ["Live", "Offline"], default: "Offline" },
    vehicleType: { type: String, required: true },
    vehicleNumber: { type: String, required: true },

    // 👇 Proper GeoJSON location field
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },

    // ✅ Firebase Cloud Messaging & Platform details
    fcmToken: { type: String, default: null, index: true },
    fcmTokenUpdatedAt: { type: Date, default: null },
    platform: { type: String, enum: ["android", "ios"], default: "android" },
    notificationEnabled: { type: Boolean, default: true },

    // ✅ Driver performance and account info
    active: { type: Boolean, default: false },
    totalPayment: { type: Number, default: 0 },
    settlement: { type: Number, default: 0 },
    hoursLive: { type: Number, default: 0 },
    dailyHours: { type: Number, default: 0 },
    dailyRides: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    loginTime: { type: String },
    logoutTime: { type: String },
    earnings: { type: Number, default: 0 },

    // ✅ Security & account settings
    mustChangePassword: { type: Boolean, default: true },
    lastUpdate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Enable GeoJSON location-based queries
driverSchema.index({ location: "2dsphere" });

// Static method to generate driver ID
driverSchema.statics.generateDriverId = async function(vehicleNumber) {
  const vehicleNum = vehicleNumber.replace(/\D/g, '').slice(-4);
  const baseId = `dri${vehicleNum}`;
  
  let counter = 1;
  let driverId = baseId;
  
  // Check if driverId exists and increment counter if needed
  while (await this.findOne({ driverId })) {
    driverId = `${baseId}${counter}`;
    counter++;
  }
  
  return driverId;
};

// Static method to get driver statistics
driverSchema.statics.getDriverStats = async function() {
  const totalDrivers = await this.countDocuments();
  const onlineDrivers = await this.countDocuments({ status: "Live" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newDriversToday = await this.countDocuments({
    createdAt: { $gte: today }
  });
  
  return {
    totalDrivers,
    onlineDrivers,
    newDriversToday
  };
};

// Instance method to calculate rating
driverSchema.methods.updateRating = function(newRating) {
  this.totalRatings += 1;
  this.rating = ((this.rating * (this.totalRatings - 1)) + newRating) / this.totalRatings;
};

module.exports = mongoose.model("Driver", driverSchema);





// const mongoose = require("mongoose");

// const driverSchema = new mongoose.Schema(
//   {
//     driverId: { type: String, required: true, unique: true },
//     name: { type: String, required: true },
//     phone: { type: String, required: true, unique: true },
//     passwordHash: { type: String, required: true },

//     status: { type: String, enum: ["Live", "Offline"], default: "Offline" },
//     vehicleType: { type: String },

//     // 👇 Proper GeoJSON location field (for live tracking, nearby driver, etc.)
//     location: {
//       type: { type: String, enum: ["Point"], default: "Point" },
//       coordinates: { type: [Number], required: true }, // [longitude, latitude]
//     },

//     // ✅ Firebase Cloud Messaging & Platform details
//     fcmToken: { type: String, default: null ,  index: true },
// fcmTokenUpdatedAt: { 
//   type: Date, 
//   default: null 
// },
// platform: { 
//   type: String, 
//   enum: ["android", "ios"], 
//   default: "android" 
// },
// notificationEnabled: { 
//   type: Boolean, 
//   default: true 
// },

//     // ✅ Driver performance and account info
//     active: { type: Boolean, default: false },
//     totalPayment: { type: Number, default: 0 },
//     settlement: { type: Number, default: 0 },
//     hoursLive: { type: Number, default: 0 },
//     dailyHours: { type: Number, default: 0 },
//     dailyRides: { type: Number, default: 0 },
//     loginTime: { type: String },
//     logoutTime: { type: String },
//     earnings: { type: Number, default: 0 },

//     // ✅ Security & account settings
//     mustChangePassword: { type: Boolean, default: true },
//     lastUpdate: { type: Date, default: Date.now },
//   },
//   { timestamps: true }
// );

// // ✅ Enable GeoJSON location-based queries (for nearby driver search)
// driverSchema.index({ location: "2dsphere" });

// module.exports = mongoose.model("Driver", driverSchema);
