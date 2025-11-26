const Order = require('../models/Order');
const Registration = require('../models/user/Registration');

// Create new order
exports.createOrder = async (req, res) => {
  try {
    const { 
      userId, 
      products, 
      deliveryAddress, 
      paymentMethod,
      useWallet = false 
    } = req.body;

    console.log('📦 Creating new order for user:', userId);

    // Get user details
    const user = await Registration.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Calculate totals
    const subtotal = products.reduce((total, item) => total + (item.price * item.quantity), 0);
    const tax = subtotal * 0.08;
    const shipping = subtotal > 499 ? 0 : 5.99;
    const totalAmount = subtotal + tax + shipping;

    // Create order data
    const orderData = {
      user: userId,
      customerId: user.customerId,
      customerName: user.name,
      customerPhone: user.phoneNumber,
      customerEmail: user.email || '',
      customerAddress: user.address,
      products: products.map(item => ({
        productId: item._id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        images: item.images || [],
        category: item.category || 'General'
      })),
      totalAmount,
      subtotal,
      tax,
      shipping,
      deliveryAddress,
      paymentMethod: useWallet ? 'wallet' : paymentMethod,
      status: 'order_confirmed'
    };

    // Create order
    const order = new Order(orderData);
    await order.save();

    console.log('✅ Order created successfully:', {
      orderId: order.orderId,
      customer: user.name,
      total: totalAmount,
      products: products.length
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        orderId: order.orderId,
        totalAmount: order.totalAmount,
        status: order.status,
        orderDate: order.orderDate
      }
    });

  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create order',
      details: error.message 
    });
  }
};

// Get orders for customer
exports.getCustomerOrders = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('📦 Fetching orders for user:', userId);

    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 });

    const ordersWithCleanData = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      totalAmount: order.totalAmount,
      products: order.products,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
      orderDate: order.orderDate,
      createdAt: order.createdAt
    }));

    console.log(`✅ Found ${orders.length} orders for user ${userId}`);

    res.json({
      success: true,
      data: ordersWithCleanData
    });

  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders' 
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    console.log(`🔄 Updating order ${orderId} to status: ${status}`);

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    order.status = status;
    await order.save();

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: order.orderId,
        status: order.status
      }
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update order status' 
    });
  }
};

// Get all orders for admin
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('user', 'name phoneNumber email address customerId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(query);

    // Clean data for admin panel
    const cleanOrders = orders.map(order => ({
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      products: order.products.map(product => ({
        name: product.name,
        price: product.price,
        quantity: product.quantity,
        total: product.price * product.quantity,
        category: product.category
      })),
      totalAmount: order.totalAmount,
      status: order.status,
      paymentMethod: order.paymentMethod,
      orderDate: order.orderDate,
      deliveryAddress: order.deliveryAddress
    }));

    res.json({
      success: true,
      data: cleanOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Error fetching all orders:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders' 
    });
  }
};

// Get order statistics
exports.getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const pendingOrders = await Order.countDocuments({ 
      status: { $in: ['order_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'] } 
    });
    
    // Calculate total revenue
    const revenueResult = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get customer count
    const customerCount = await Registration.countDocuments();

    res.json({
      success: true,
      data: {
        totalOrders,
        deliveredOrders,
        pendingOrders,
        totalRevenue,
        avgOrderValue,
        customerCount
      }
    });

  } catch (error) {
    console.error('❌ Error fetching order stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch order statistics' 
    });
  }
};