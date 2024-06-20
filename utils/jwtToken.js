const sendToken = (user, statusCode, res, req) => {
  const token = user.getJwtToken();

  // Options for cookies
  const options = {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: "strict", // Adjust based on your security needs
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https', // Conditionally set secure based on HTTPS
  };

  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    user,
    token,
  });
};

module.exports = sendToken;
