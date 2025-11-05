const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const User = require('../models/User');
const { generateToken, generateRefreshToken, authenticateToken, verifyRefreshToken } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const twilio = require('twilio');
const admin = require('firebase-admin');
const TOTPService = require('../utils/totpService');

const router = express.Router();

// Initialize Twilio client (only if credentials are provided)
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && 
      process.env.TWILIO_AUTH_TOKEN && 
      !process.env.TWILIO_ACCOUNT_SID.includes('xxxxx')) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('✅ Twilio client initialized');
  } else {
    console.log('⚠️ Twilio not configured - SMS features will be disabled');
  }
} catch (error) {
  console.error('❌ Twilio initialization error:', error.message);
}

// Initialize Firebase Admin (if not already initialized)  
if (!admin.apps.length) {
  try {
    // Try to use service account key file first
    const serviceAccountPath = './crisprai-3be18-firebase-adminsdk-fbsvc-619cda2c5b.json';
    const fs = require('fs');
    const path = require('path');
    
    // Try different possible paths
    const possiblePaths = [
      serviceAccountPath,
      path.join(__dirname, '..', 'crisprai-3be18-firebase-adminsdk-fbsvc-619cda2c5b.json'),
      path.join(process.cwd(), 'crisprai-3be18-firebase-adminsdk-fbsvc-619cda2c5b.json')
    ];
    
    let serviceAccount = null;
    let foundPath = null;
    
    console.log('🔍 Looking for Firebase service account key file...');
    for (const testPath of possiblePaths) {
      console.log('   Checking:', testPath);
      if (fs.existsSync(testPath)) {
        foundPath = testPath;
        try {
          const keyFileContent = fs.readFileSync(testPath, 'utf8');
          serviceAccount = JSON.parse(keyFileContent);
          console.log('   ✅ Found and parsed at:', testPath);
          break;
        } catch (parseError) {
          console.log('   ❌ Error parsing JSON:', parseError.message);
        }
      } else {
        console.log('   ❌ Not found');
      }
    }
    
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'crisprai-3be18'
      });
      console.log('✅ Firebase Admin initialized with service account key file');
      console.log('📁 Using key file:', foundPath);
    } else {
      // Fallback to environment variable
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : null;
      
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || 'crisprai-3be18'
        });
        console.log('✅ Firebase Admin initialized with environment variable');
      } else {
        console.log('⚠️ Firebase Admin not initialized - service account key not found');
        console.log('📝 To enable Firebase verification, ensure service account key file exists');
      }
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
  }
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs for auth routes
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    code: 'TOO_MANY_REQUESTS'
  }
});

const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit verification attempts
  message: {
    success: false,
    message: 'Too many verification attempts, please try again later',
    code: 'TOO_MANY_VERIFICATION_ATTEMPTS'
  }
});

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // Limit each IP to 2 OTP requests per minute
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later',
    code: 'TOO_MANY_REQUESTS'
  }
});

// Validation middleware
const validateSignup = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    })
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg
      }))
    });
  }
  next();
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', authLimiter, validateSignup, handleValidationErrors, async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
        code: 'USER_EXISTS'
      });
    }

    // Create new user
    const user = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password
    });

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();

    // Save user to database
    await user.save();

    // Send verification email
    try {
      await emailService.sendVerificationEmail(user, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the signup process if email fails
    }

    // Return success response (don't include sensitive data)
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please check your email to verify your account.',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create account. Please try again.',
      code: 'SIGNUP_ERROR'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Find user by email
    const user = await User.getByEmail(email, true);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if this user primarily uses phone authentication
    if (user.authMethod === 'mobile' || user.authMethod === 'firebase' || user.mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'This account is registered with phone number. Please use phone authentication instead.',
        code: 'USE_PHONE_AUTH',
        data: {
          mobileNumber: user.mobileNumber,
          authMethod: user.authMethod
        }
      });
    }

    // Check if this user has TOTP enabled
    if (user.totpEnabled) {
      return res.status(400).json({
        success: false,
        message: 'This account has two-factor authentication enabled. Please use TOTP login instead.',
        code: 'USE_TOTP_AUTH',
        data: {
          email: user.email,
          totpEnabled: true,
          authMethod: 'totp'
        }
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts',
        code: 'ACCOUNT_LOCKED',
        data: {
          lockUntil: user.lockUntil
        }
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = rememberMe ? generateRefreshToken(user._id) : null;

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          lastLogin: user.lastLogin,
          profile: user.profile,
          preferences: user.preferences
        },
        token,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      code: 'LOGIN_ERROR'
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify user email
// @access  Public
router.post('/verify-email', verificationLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Find user by verification token
    const user = await User.findByVerificationToken(token);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Verify email
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    // Generate token for automatic login
    const authToken = generateToken(user._id);

    res.json({
      success: true,
      message: 'Email verified successfully! Welcome to CRISPR Predict.',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isEmailVerified: user.isEmailVerified
        },
        token: authToken
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed. Please try again.',
      code: 'VERIFICATION_ERROR'
    });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Public
router.post('/resend-verification', verificationLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
        code: 'EMAIL_REQUIRED'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: 'If an account with that email exists, a verification email has been sent.'
      });
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(user, verificationToken);

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification email. Please try again.',
      code: 'RESEND_ERROR'
    });
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
// @access  Public
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required',
        code: 'REFRESH_TOKEN_REQUIRED'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Generate new access token
    const newToken = generateToken(user._id);

    res.json({
      success: true,
      data: {
        token: newToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          lastLogin: user.lastLogin,
          profile: user.profile,
          preferences: user.preferences,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information',
      code: 'GET_USER_ERROR'
    });
  }
});

// @route   POST /api/auth/google
// @desc    Google OAuth authentication
// @access  Public
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required',
        code: 'CREDENTIAL_REQUIRED'
      });
    }

    // Verify and decode the Google JWT token
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Google email is not verified',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Create new user with Google data
      user = new User({
        fullName: name,
        email: email.toLowerCase(),
        isEmailVerified: true, // Google emails are pre-verified
        googleId,
        profile: {
          avatar: picture
        },
        // Generate a random password for Google users (they won't use it)
        password: Math.random().toString(36).slice(-8)
      });
      await user.save();
    } else {
      // Update existing user with Google ID if not already set
      if (!user.googleId) {
        user.googleId = googleId;
        user.isEmailVerified = true;
        if (picture && !user.profile.avatar) {
          user.profile.avatar = picture;
        }
        await user.save();
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          lastLogin: user.lastLogin,
          profile: user.profile,
          preferences: user.preferences
        },
        token,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('Google authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed. Please try again.',
      code: 'GOOGLE_AUTH_ERROR'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token invalidation)
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  // In a production app, you might want to maintain a blacklist of tokens
  // For now, we'll rely on client-side token removal
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @route   POST /api/auth/send-otp
// @desc    Send OTP via SMS (Mobile Only)
// @access  Public


// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and login/register user
// @access  Public


// POST /api/auth/send-otp
// In your Express backend
router.post("/send-otp", async (req, res) => {
  const { mobileNumber } = req.body;

  if (!mobileNumber)
    return res.status(400).json({ success: false, message: "Mobile number required" });

  try {
    const formatted = mobileNumber.startsWith("+") ? mobileNumber : `+91${mobileNumber}`;
    const verification = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: formatted, channel: "sms" });

    console.log("OTP Sent:", verification.to, verification.status, verification.sid);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Twilio Send OTP Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/verify-otp
// POST /api/auth/verify-otp
// POST /api/auth/verify-otp
// backend/auth.js

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  const { mobileNumber, code, fullName } = req.body;

  try {
    const formatted = mobileNumber.startsWith("+") ? mobileNumber : `+91${mobileNumber}`;
    const verificationCheck = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: formatted, code });

    console.log("Verification Check:", verificationCheck.status);

    if (verificationCheck.status === "approved") {
      let user = await User.findOne({ mobileNumber: formatted });
      
      if (!user) {
        // This is a sign-up flow.
        if (!fullName) {
          return res.status(400).json({
            success: false,
            message: "Full name is required for phone signup.",
          });
        }

        // Create the new user
        user = new User({
          mobileNumber: formatted,
          isPhoneVerified: true,
          fullName: fullName, 
          // authMethod: 'mobile', // <-- THIS LINE IS REMOVED
        });
      } else {
        // This is a login flow
        user.isPhoneVerified = true;
      }

      user.lastLogin = new Date();
      
      try {
        await user.save();
      } catch (saveError) {
        console.error("User save error after OTP verify:", saveError.message);
        return res.status(400).json({ success: false, message: saveError.message });
      }

      // Generate the token, just like in your /login route
      const token = generateToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      return res.json({
        success: true,
        message: "OTP verified and login successful",
        data: {
          token,
          refreshToken,
          user: {
            id: user._id,
            fullName: user.fullName,
            mobileNumber: user.mobileNumber,
            isPhoneVerified: user.isPhoneVerified,
            authMethod: 'phone',
            lastLogin: user.lastLogin,
            email: user.email,
            profile: user.profile,
            preferences: user.preferences
          },
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      });

    } else {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }
  } catch (error) {
    console.error("Twilio Verify OTP Error:", error);
    if (error.code === 20404) { 
        return res.status(400).json({ success: false, message: "OTP has expired or is invalid. Please request a new one." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});


// @route   POST /api/auth/check-phone
// @desc    Check if user exists with phone number
// @access  Public
router.post('/check-phone', [
  body('mobileNumber')
    .isMobilePhone()
    .withMessage('Please provide a valid mobile number')
], handleValidationErrors, async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    // Find user by mobile number
    const user = await User.findOne({ mobileNumber });
    
    res.json({
      success: true,
      data: {
        userExists: !!user,
        user: user ? {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          isEmailVerified: user.isEmailVerified,
          isMobileVerified: user.isMobileVerified
        } : null
      }
    });

  } catch (error) {
    console.error('Check phone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check user. Please try again.',
      code: 'CHECK_PHONE_ERROR'
    });
  }
});


// @route   POST /api/auth/phone-login
// @desc    Login with phone number and password (for existing users)
// @access  Public
router.post('/phone-login', authLimiter, [
  body('mobileNumber')
    .isMobilePhone()
    .withMessage('Please provide a valid mobile number'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { mobileNumber, password } = req.body;

    // Find user by mobile number
    const user = await User.findOne({ mobileNumber }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this phone number',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts',
        code: 'ACCOUNT_LOCKED',
        data: {
          lockUntil: user.lockUntil
        }
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid password',
        code: 'INVALID_PASSWORD'
      });
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login and mobile verification status
    user.lastLogin = new Date();
    user.isMobileVerified = true;
    user.authMethod = 'mobile';
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    console.log(`✅ Phone login successful for user: ${user._id}`);

    // Return success response
    res.json({
      success: true,
      message: 'Phone login successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          isEmailVerified: user.isEmailVerified,
          isMobileVerified: user.isMobileVerified,
          lastLogin: user.lastLogin,
          profile: user.profile,
          preferences: user.preferences
        },
        token,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json({
      success: false,
      message: 'Phone login failed. Please try again.',
      code: 'PHONE_LOGIN_ERROR'
    });
  }
});

// @route   POST /api/auth/phone-signup
// @desc    Signup with phone number (for new users)
// @access  Public
router.post('/phone-signup', authLimiter, [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('mobileNumber')
    .isMobilePhone()
    .withMessage('Please provide a valid mobile number'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], handleValidationErrors, async (req, res) => {
  try {
    const { fullName, mobileNumber, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { mobileNumber },
        { email: mobileNumber } // In case it was stored as email before
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this phone number already exists',
        code: 'USER_EXISTS'
      });
    }

    // Create new user
    const user = new User({
      fullName: fullName.trim(),
      mobileNumber,
      password,
      isMobileVerified: true,
      isEmailVerified: false, // No email provided yet
      authMethod: 'mobile',
      lastLogin: new Date(),
      profile: {
        phoneVerified: true,
        verificationMethod: 'mobile'
      }
    });

    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    console.log(`✅ Phone signup successful for user: ${user._id}`);

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Account created successfully with phone number!',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          isEmailVerified: user.isEmailVerified,
          isMobileVerified: user.isMobileVerified,
          lastLogin: user.lastLogin,
          profile: user.profile,
          preferences: user.preferences,
          createdAt: user.createdAt
        },
        token,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('Phone signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Account creation failed. Please try again.',
      code: 'PHONE_SIGNUP_ERROR'
    });
  }
});

// @route   POST /api/auth/check-user-totp
// @desc    Check if user has TOTP enabled
// @access  Public
router.post('/check-user-totp', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], handleValidationErrors, async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    res.json({
      success: true,
      data: {
        hasTOTP: user ? user.totpEnabled : false,
        user: user ? {
          id: user._id,
          email: user.email,
          totpEnabled: user.totpEnabled
        } : null
      }
    });

  } catch (error) {
    console.error('Check user TOTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check user TOTP status',
      code: 'CHECK_TOTP_ERROR'
    });
  }
});

// ==================== TOTP Authentication Routes ====================

// @route   POST /api/auth/totp/setup
// @desc    Generate TOTP secret and QR code for user
// @access  Private (user must be logged in)
router.post('/totp/setup', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (user.totpEnabled) {
      return res.status(400).json({
        success: false,
        message: 'TOTP is already enabled for this account',
        code: 'TOTP_ALREADY_ENABLED'
      });
    }

    // Generate secret for this user
    const { secret, otpAuthUrl } = TOTPService.generateSecret(
      user.email || user.mobileNumber || user.fullName,
      'CRISPR Predict'
    );

    // Generate QR code
    const qrCodeImage = await TOTPService.generateQRCode(otpAuthUrl);

    // Temporarily store secret (don't save to DB until verified)
    // In production, you might store this in Redis with expiration
    global.tempTOTPSecrets = global.tempTOTPSecrets || {};
    global.tempTOTPSecrets[user._id] = secret;

    console.log(`🔐 TOTP setup initiated for user: ${user._id}`);

    res.json({
      success: true,
      message: 'TOTP setup initiated',
      data: {
        qrCode: qrCodeImage, // Base64 encoded image
        manualEntryKey: secret, // In case QR scan doesn't work
        instructions: {
          step1: 'Install Google Authenticator, Authy, or similar app',
          step2: 'Scan the QR code with your authenticator app',
          step3: 'Enter the 6-digit code from your app to confirm setup'
        }
      }
    });

  } catch (error) {
    console.error('TOTP setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup TOTP',
      code: 'TOTP_SETUP_ERROR'
    });
  }
});

// @route   POST /api/auth/totp/verify-setup
// @desc    Verify TOTP token and enable TOTP for user
// @access  Private
router.post('/totp/verify-setup', authenticateToken, [
  body('token')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('TOTP token must be a 6-digit number')
], handleValidationErrors, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user._id);

    // Get temporary secret
    const tempSecret = global.tempTOTPSecrets?.[user._id];
    if (!tempSecret) {
      return res.status(400).json({
        success: false,
        message: 'No TOTP setup in progress. Please start setup again.',
        code: 'NO_TOTP_SETUP'
      });
    }

    // Verify the token
    const isValid = TOTPService.verifyToken(tempSecret, token);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid code. Please check your authenticator app and try again.',
        code: 'INVALID_TOTP_TOKEN'
      });
    }

    // Generate backup codes
    const backupCodes = TOTPService.generateBackupCodes();

    // Save to database
    user.totpSecret = tempSecret;
    user.totpEnabled = true;
    user.authMethod = 'totp';
    user.totpBackupCodes = backupCodes.map(code => ({ 
      code, 
      used: false,
      createdAt: new Date()
    }));
    await user.save();

    // Clear temporary secret
    delete global.tempTOTPSecrets[user._id];

    console.log(`✅ TOTP enabled for user: ${user._id}`);

    res.json({
      success: true,
      message: 'TOTP enabled successfully! Save your backup codes.',
      data: {
        backupCodes: backupCodes,
        warning: 'Store these backup codes safely. You can use them to access your account if you lose your phone.'
      }
    });

  } catch (error) {
    console.error('TOTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify TOTP',
      code: 'TOTP_VERIFY_ERROR'
    });
  }
});

// @route   POST /api/auth/totp/verify
// @desc    Verify TOTP token during login
// @access  Public (but requires user context)
router.post('/totp/verify', [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required'),
  body('token')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('TOTP token must be a 6-digit number')
], handleValidationErrors, async (req, res) => {
  try {
    const { userId, token } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.totpEnabled) {
      return res.status(400).json({
        success: false,
        message: 'TOTP not enabled for this account',
        code: 'TOTP_NOT_ENABLED'
      });
    }

    // Try TOTP verification first
    const isValidTOTP = TOTPService.verifyToken(user.totpSecret, token);
    
    if (isValidTOTP) {
      console.log(`✅ TOTP verification successful for user: ${user._id}`);
      return res.json({
        success: true,
        message: 'TOTP verification successful'
      });
    }

    // If TOTP fails, check backup codes
    const backupCodeIndex = user.totpBackupCodes.findIndex(
      backup => backup.code === token.toUpperCase() && !backup.used
    );

    if (backupCodeIndex !== -1) {
      // Mark backup code as used
      user.totpBackupCodes[backupCodeIndex].used = true;
      await user.save();

      console.log(`✅ Backup code used for user: ${user._id}`);
      return res.json({
        success: true,
        message: 'Backup code verification successful',
        warning: 'You used a backup code. Consider generating new ones.'
      });
    }

    // Both TOTP and backup codes failed
    console.log(`❌ TOTP verification failed for user: ${user._id}`);
    res.status(400).json({
      success: false,
      message: 'Invalid code. Please check your authenticator app or try a backup code.',
      code: 'INVALID_TOTP_TOKEN'
    });

  } catch (error) {
    console.error('TOTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify TOTP',
      code: 'TOTP_VERIFY_ERROR'
    });
  }
});

// @route   POST /api/auth/totp/login
// @desc    Complete login with TOTP verification
// @access  Public
router.post('/totp/login', authLimiter, [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('totpToken')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('TOTP token must be a 6-digit number')
], handleValidationErrors, async (req, res) => {
  try {
    const { email, password, totpToken, rememberMe } = req.body;

    // Find user by email
    const user = await User.getByEmail(email, true);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if TOTP is enabled
    if (!user.totpEnabled) {
      return res.status(400).json({
        success: false,
        message: 'TOTP is not enabled for this account',
        code: 'TOTP_NOT_ENABLED'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts',
        code: 'ACCOUNT_LOCKED',
        data: {
          lockUntil: user.lockUntil
        }
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify TOTP token
    const isValidTOTP = TOTPService.verifyToken(user.totpSecret, totpToken);
    
    if (!isValidTOTP) {
      // Check backup codes
      const backupCodeIndex = user.totpBackupCodes.findIndex(
        backup => backup.code === totpToken.toUpperCase() && !backup.used
      );

      if (backupCodeIndex === -1) {
        await user.incLoginAttempts();
        return res.status(400).json({
          success: false,
          message: 'Invalid TOTP code. Please check your authenticator app or try a backup code.',
          code: 'INVALID_TOTP_TOKEN'
        });
      }

      // Mark backup code as used
      user.totpBackupCodes[backupCodeIndex].used = true;
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = rememberMe ? generateRefreshToken(user._id) : null;

    console.log(`✅ TOTP login successful for user: ${user._id}`);

    // Return success response
    res.json({
      success: true,
      message: 'TOTP login successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          isEmailVerified: user.isEmailVerified,
          isMobileVerified: user.isMobileVerified,
          totpEnabled: user.totpEnabled,
          lastLogin: user.lastLogin,
          profile: user.profile,
          preferences: user.preferences
        },
        token,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('TOTP login error:', error);
    res.status(500).json({
      success: false,
      message: 'TOTP login failed. Please try again.',
      code: 'TOTP_LOGIN_ERROR'
    });
  }
});

// @route   POST /api/auth/totp/disable
// @desc    Disable TOTP for user
// @access  Private
router.post('/totp/disable', authenticateToken, [
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('totpToken')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('TOTP token must be a 6-digit number')
], handleValidationErrors, async (req, res) => {
  try {
    const { password, totpToken } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password',
        code: 'INVALID_PASSWORD'
      });
    }

    // Verify TOTP token
    const isValidTOTP = TOTPService.verifyToken(user.totpSecret, totpToken);
    if (!isValidTOTP) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TOTP code',
        code: 'INVALID_TOTP_TOKEN'
      });
    }

    // Disable TOTP
    user.totpSecret = undefined;
    user.totpEnabled = false;
    user.totpBackupCodes = [];
    user.authMethod = 'email'; // Revert to email auth
    await user.save();

    console.log(`✅ TOTP disabled for user: ${user._id}`);

    res.json({
      success: true,
      message: 'TOTP disabled successfully'
    });

  } catch (error) {
    console.error('TOTP disable error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable TOTP',
      code: 'TOTP_DISABLE_ERROR'
    });
  }
});

module.exports = router;
