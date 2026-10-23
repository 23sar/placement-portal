const User = require("../models/User");

exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    const user = new User({ name, email, password });
    await user.save();

    res.json({ message: "User registered" });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful" });
};