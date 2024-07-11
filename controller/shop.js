const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const Shop = require("../model/shop");
const sendMail = require("../utils/sendMail");
const { isAuthenticated, isSeller, isAdmin } = require("../middleware/auth");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create shop account
router.post(
  "/create-shop",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { email, activation_token } = req.body;

      // Check if activation token is provided
      if (!activation_token) {
        return next(new ErrorHandler("Activation token is missing", 400));
      }

      // Verify activation token
      const decoded = jwt.verify(activation_token, process.env.ACTIVATION_SECRET);

      // Extract email from decoded token
      const { email: decodedEmail } = decoded;

      // Check if provided email matches decoded email
      if (email !== decodedEmail) {
        return next(new ErrorHandler("Invalid activation token", 400));
      }

      // Check if user with the same email already exists
      const sellerEmail = await Shop.findOne({ email });
      if (sellerEmail) {
        return next(new ErrorHandler("User already exists", 400));
      }

      // Upload avatar to Cloudinary
      const myCloud = await cloudinary.uploader.upload(req.body.avatar, {
        folder: "avatars",
      });

      // Create seller object
      const seller = new Shop({
        name: req.body.name,
        email: email,
        password: req.body.password,
        avatar: {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        },
        address: req.body.address,
        phoneNumber: req.body.phoneNumber,
        zipCode: req.body.zipCode,
      });

      // Save seller to database
      await seller.save();

      // Generate activation token
      const activationToken = createActivationToken({
        id: seller._id,
        email: seller.email,
      });

      // URLs for activation email
      const activationUrl = `http://localhost:3000/seller/activation/${activationToken}`;
      const activationUrl1 = `https://guriraline.netlify.app/activation/${activationToken}`;
      const activationUrl3 = `https://guriraline.com/activation/${activationToken}`;

      // Send activation email
      await sendMail({
        email: seller.email,
        subject: "Activate your Shop",
        message: `Hello ${seller.name}, please click on one of the links to activate your account:\n\n${activationUrl3}\n\n\n${activationUrl}\n\n${activationUrl1}`,
      });

      // Respond to client
      res.status(201).json({
        success: true,
        message: `Please check your email: ${seller.email} to activate your shop!`,
      });
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return next(new ErrorHandler("Invalid token", 400));
      }
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Create activation token
const createActivationToken = (payload) => {
  return jwt.sign(payload, process.env.ACTIVATION_SECRET, {
    expiresIn: "10m", // Token expires in 10 minutes
  });
};

// Activate shop account
router.post(
  "/activation",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { activation_token } = req.body;

      // Check if activation token is provided
      if (!activation_token) {
        return next(new ErrorHandler("Activation token is missing", 400));
      }

      // Verify activation token
      const decoded = jwt.verify(
        activation_token,
        process.env.ACTIVATION_SECRET
      );

      // Extract email from decoded token
      const { email } = decoded;

      // Find seller by email
      let seller = await Shop.findOne({ email });

      // If seller doesn't exist
      if (!seller) {
        return next(new ErrorHandler("User not found", 404));
      }

      // If seller is already activated
      if (seller.isActivated) {
        return next(new ErrorHandler("Account is already activated", 400));
      }

      // Activate seller account
      seller.isActivated = true;

      // Save seller in database
      await seller.save();

      // Respond to client
      res.status(200).json({
        success: true,
        message: "Account activated successfully!",
      });
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return next(new ErrorHandler("Invalid token", 400));
      }
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Login shop account
router.post(
  "/login-shop",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Validate email and password
      if (!email || !password) {
        return next(new ErrorHandler("Please provide all fields!", 400));
      }

      // Find seller by email
      const seller = await Shop.findOne({ email }).select("+password");

      // If seller doesn't exist
      if (!seller) {
        return next(new ErrorHandler("User doesn't exist!", 400));
      }

      // Validate password
      const isPasswordValid = await seller.comparePassword(password);

      // If password is invalid
      if (!isPasswordValid) {
        return next(new ErrorHandler("Please provide the correct information", 400));
      }

      // If seller is not activated
      if (!seller.isActivated) {
        return next(new ErrorHandler("Account is not activated", 400));
      }

      // Send token to client
      sendShopToken(seller, 200, res); // Implement sendShopToken function
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Helper function to send token to client
const sendShopToken = (seller, statusCode, res) => {
  const token = seller.generateToken();
  res.status(statusCode).json({
    success: true,
    token,
  });
};

// Middleware to get authenticated seller
router.get(
  "/getSeller",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Find seller by ID
      const seller = await Shop.findById(req.seller._id);

      // If seller doesn't exist
      if (!seller) {
        return next(new ErrorHandler("User doesn't exist", 400));
      }

      // Respond to client
      res.status(200).json({
        success: true,
        seller,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Logout from shop account
router.get(
  "/logout",
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Clear seller token cookie
      res.clearCookie("seller_token");

      // Respond to client
      res.status(200).json({
        success: true,
        message: "Log out successful!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Get shop info by ID
router.get(
  "/get-shop-info/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Find shop by ID
      const shop = await Shop.findById(req.params.id);

      // If shop doesn't exist
      if (!shop) {
        return next(new ErrorHandler("Shop not found", 404));
      }

      // Respond to client
      res.status(200).json({
        success: true,
        shop,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Update shop profile picture
router.put(
  "/update-shop-avatar",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Find seller by ID
      let seller = await Shop.findById(req.seller._id);

      // If seller doesn't exist
      if (!seller) {
        return next(new ErrorHandler("User not found", 404));
      }

      // Delete previous avatar from Cloudinary
      await cloudinary.uploader.destroy(seller.avatar.public_id);

      // Upload new avatar to Cloudinary
      const myCloud = await cloudinary.uploader.upload(req.body.avatar, {
        folder: "avatars",
        width: 150,
      });

      // Update seller avatar details
      seller.avatar = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url,
      };

      // Save updated seller in database
      await seller.save();

      // Respond to client
      res.status(200).json({
        success: true,
        seller,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Update seller information
router.put(
  "/update-seller-info",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { name, description, address, phoneNumber, zipCode } = req.body;

      // Find seller by ID
      const seller = await Shop.findById(req.seller._id);

      // If seller doesn't exist
      if (!seller) {
        return next(new ErrorHandler("User not found", 404));
      }

      // Update seller details
      seller.name = name;
      seller.description = description;
      seller.address = address;
      seller.phoneNumber = phoneNumber;
      seller.zipCode = zipCode;

      // Save updated seller in database
      await seller.save();

      // Respond to client
      res.status(200).json({
        success: true,
        seller,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Get all sellers (for admin)
router.get(
  "/admin-all-sellers",
  isAuthenticated,
  isAdmin("Admin"),
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Find all sellers sorted by creation date
      const sellers = await Shop.find().sort({ createdAt: -1 });

      // Respond to client
      res.status(200).json({
        success: true,
        sellers,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Delete seller by ID (admin)
router.delete(
  "/delete-seller/:id",
  isAuthenticated,
  isAdmin("Admin"),
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Find seller by ID and delete
      await Shop.findByIdAndDelete(req.params.id);

      // Respond to client
      res.status(200).json({
        success: true,
        message: "Seller deleted successfully",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Update seller withdraw methods
router.put(
  "/update-payment-methods",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { withdrawMethod } = req.body;

      // Find seller by ID and update withdraw method
      const seller = await Shop.findByIdAndUpdate(
        req.seller._id,
        { withdrawMethod },
        { new: true, runValidators: true }
      );

      // Respond to client
      res.status(200).json({
        success: true,
        seller,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Delete seller withdraw method
router.delete(
  "/delete-withdraw-method/",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      // Find seller by ID
      const seller = await Shop.findById(req.seller._id);

      // If seller doesn't exist
      if (!seller) {
        return next(new ErrorHandler("Seller not found", 404));
      }

      // Remove withdraw method from seller
      seller.withdrawMethod = null;

      // Save updated seller in database
      await seller.save();

      // Respond to client
      res.status(200).json({
        success: true,
        seller,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

module.exports = router;
