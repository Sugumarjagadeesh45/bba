const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
  customerId: { type: String, required: true },
  orderId: { type: String, required: true, unique: true },
  products: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  deliveryAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'wallet', 'card', 'upi'],
    default: 'cash'
  }
}, {
  timestamps: true
});

// Pre-save hook to generate order ID
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderId) {
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

// Static method to get order statistics
orderSchema.statics.getOrderStats = async function() {
  const totalOrders = await this.countDocuments();
  const deliveredOrders = await this.countDocuments({ status: 'delivered' });
  const pendingOrders = await this.countDocuments({ status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery'] } });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ordersToday = await this.countDocuments({
    createdAt: { $gte: today }
  });
  
  // Calculate total sales
  const salesResult = await this.aggregate([
    { $match: { status: 'delivered' } },
    { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } }
  ]);
  
  const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;
  
  return {
    totalOrders,
    deliveredOrders,
    pendingOrders,
    ordersToday,
    totalSales
  };
};

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);