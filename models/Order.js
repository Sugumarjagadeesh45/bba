const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Registration', 
    required: true 
  },
  customerId: { 
    type: String, 
    required: true 
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: ''
  },
  customerAddress: {
    type: String,
    required: true
  },
  products: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    images: [String],
    category: String
  }],
  totalAmount: { 
    type: Number, 
    required: true 
  },
  subtotal: Number,
  shipping: { 
    type: Number, 
    default: 0 
  },
  tax: { 
    type: Number, 
    default: 0 
  },
  deliveryAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { 
      type: String, 
      default: 'India' 
    }
  },
  status: {
    type: String,
    enum: [
      'order_confirmed',
      'processing', 
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled'
    ],
    default: 'order_confirmed'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'wallet', 'card', 'upi'],
    required: true
  },
  orderDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate order ID
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const Counter = require('./user/customerId');
    const counter = await Counter.findOneAndUpdate(
      { _id: 'orderId' },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    this.orderId = `ORD${(100000 + counter.sequence).toString()}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);