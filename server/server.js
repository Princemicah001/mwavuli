const express = require("express");
const cors = require("cors");
require("dotenv").config();

console.log("MONGO_URI =", process.env.MONGO_URI ? "Set" : "Not set");

const connectDB = require("./config/db");
const adminRoutes = require("./routes/adminRoutes");
const heroRoutes = require("./routes/heroRoutes");
const aboutRoutes = require("./routes/aboutRoutes");
const photoRoutes = require("./routes/photoRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const testimonialRoutes = require("./routes/testimonialRoutes");
const projectRoutes = require("./routes/projectRoutes");
const adminController = require("./controller/adminController");

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5000',
            'https://mwavuli-photographer.vercel.app',
            'https://mwavuli-photographer.vercel.app:5000',
        ];
        
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.log('Origin not allowed:', origin);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const path = require("path");
const uploadsPath = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}));

app.use("/api/admin", adminRoutes);
app.use("/api/hero", heroRoutes);
app.use("/api/about", aboutRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/projects", projectRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/favicon.ico", (req, res) => {
    const iconPath = path.join(__dirname, "..", "icon.svg");
    if (require("fs").existsSync(iconPath)) {
        res.sendFile(iconPath);
    } else {
        res.status(204).end();
    }
});

app.use(express.static(path.join(__dirname, ".."), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (/\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|woff2?|ttf|eot|css|js)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

const PORT = process.env.PORT || 5000;

async function start() {
    try {
        await connectDB();
        await adminController.seedAdmin();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}

start();

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
