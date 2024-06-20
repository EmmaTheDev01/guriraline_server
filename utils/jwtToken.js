const sendToken = (user, statusCode, res, req) => {
  const token = user.getJwtToken();

  // Determine if request is secure (HTTPS)
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';

  // Options for cookies
  const options = {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: "none", // Adjust based on your security needs
    secure: isSecure, // Conditionally set secure based on HTTPS
  };

  // Set the cookie
  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    user,
    token,
  });
};

module.exports = sendToken;
