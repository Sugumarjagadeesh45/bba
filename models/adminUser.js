const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const adminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true, // Make email required to avoid null values
    unique: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'superadmin'],
    default: 'admin',
  },
}, { 
  timestamps: true,
  // Prevent automatic index creation during development
  autoIndex: false
});

// Method to set password
adminUserSchema.methods.setPassword = async function(password) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(password, salt);
};

// Method to validate password
adminUserSchema.methods.validatePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Create indexes manually after schema definition
adminUserSchema.index({ username: 1 }, { unique: true });
adminUserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);