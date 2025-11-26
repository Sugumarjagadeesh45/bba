const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Public routes (for user app)
router.post('/create', orderController.createOrder);
router.get('/customer/:userId', orderController.getCustomerOrders);
router.put('/update-status/:orderId', orderController.updateOrderStatus);

// Admin routes (no authentication required for now)
router.get('/admin/orders', orderController.getAllOrders);
router.get('/admin/order-stats', orderController.getOrderStats);

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Order routes are working!',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;