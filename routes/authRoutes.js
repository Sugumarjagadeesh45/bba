// In /Users/webasebrandings/Downloads/cmp_back-main/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Registration = require('../models/user/Registration');
const Counter = require('../models/user/customerId');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d',
  });
};




router.get('/test', (req, res) => {
  console.log('✅ /api/auth/test route hit!');
  res.json({ 
    message: 'Auth routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Phone verification route
router.post('/verify-phone', async (req, res) => {
  try {
    console.log('✅ /api/auth/verify-phone route hit!');
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log('📞 Phone verification request for:', phoneNumber);
    
    // Your existing verification logic here...
    const Registration = require('../models/user/Registration');
    const user = await Registration.findOne({ phoneNumber });
    
    if (user) {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '30d',
      });
      
      return res.json({ 
        success: true, 
        token,
        user: { 
          name: user.name, 
          phoneNumber: user.phoneNumber, 
          customerId: user.customerId, 
          profilePicture: user.profilePicture 
        }
      });
    }
    
    return res.json({ success: true, newUser: true });
    
  } catch (err) {
    console.error('❌ Error in verify-phone:', err);
    res.status(500).json({ error: err.message });
  }
});



const getNextCustomerId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'customerId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return (100000 + counter.sequence).toString();
};

// ✅ ADD THIS TEST ENDPOINT
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth routes are working!',
    availableEndpoints: [
      'POST /api/auth/verify-phone',
      'POST /api/auth/register'
    ]
  });
});

// Phone number verification endpoint
router.post('/verify-phone', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const user = await Registration.findOne({ phoneNumber });
    if (user) {
      const token = generateToken(user._id);
      return res.json({ 
        success: true, 
        token,
        user: { 
          name: user.name, 
          phoneNumber: user.phoneNumber, 
          customerId: user.customerId, 
          profilePicture: user.profilePicture 
        }
      });
    }
    return res.json({ success: true, newUser: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADD THE MISSING REGISTER ENDPOINT
router.post('/register', async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;

    if (!name || !phoneNumber || !address) {
      return res.status(400).json({ error: 'Name, phone number, and address are required' });
    }

    const existingUser = await Registration.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const customerId = await getNextCustomerId();

    const newUser = new Registration({
      name,
      phoneNumber,
      address,
      customerId
    });

    await newUser.save();

    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      token,
      user: { 
        name: newUser.name, 
        phoneNumber: newUser.phoneNumber, 
        address: newUser.address, 
        customerId: newUser.customerId 
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

// // D:\newapp\fullbackend-main\fullbackend-main_\routes\authRoutes.js

// const express = require('express');
// const router = express.Router();
// const jwt = require('jsonwebtoken');
// const Registration = require('../models/user/Registration');
// const Counter = require('../models/user/customerId');

// const generateToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret', {
//     expiresIn: '30d',
//   });
// };

// const getNextCustomerId = async () => {
//   const counter = await Counter.findOneAndUpdate(
//     { _id: 'customerId' },
//     { $inc: { sequence: 1 } },
//     { new: true, upsert: true }
//   );
//   return (100000 + counter.sequence).toString();
// };

// // Phone number verification endpoint
// router.post('/verify-phone', async (req, res) => {
//   try {
//     const { phoneNumber } = req.body;
//     if (!phoneNumber) {
//       return res.status(400).json({ error: 'Phone number is required' });
//     }

//     const user = await Registration.findOne({ phoneNumber });
//     if (user) {
//       const token = generateToken(user._id);
//       return res.json({ 
//         success: true, 
//         token,
//         user: { 
//           name: user.name, 
//           phoneNumber: user.phoneNumber, 
//           customerId: user.customerId, 
//           profilePicture: user.profilePicture 
//         }
//       });
//     }
//     return res.json({ success: true, newUser: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // User registration endpoint
// router.post('/register', async (req, res) => {
//   try {
//     const { name, phoneNumber, address } = req.body;

//     if (!name || !phoneNumber || !address) {
//       return res.status(400).json({ error: 'Name, phone number, and address are required' });
//     }

//     const existingUser = await Registration.findOne({ phoneNumber });
//     if (existingUser) {
//       return res.status(400).json({ error: 'Phone number already registered' });
//     }

//     const customerId = await getNextCustomerId();

//     const newUser = new Registration({
//       name,
//       phoneNumber,
//       address,
//       customerId
//     });

//     await newUser.save();

//     const token = generateToken(newUser._id);

//     res.status(201).json({
//       success: true,
//       token,
//       user: { name: newUser.name, phoneNumber: newUser.phoneNumber, address: newUser.address, customerId: newUser.customerId }
//     });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// module.exports = router;
