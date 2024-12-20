const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_PROCESSING = 3;
let processingQueue = [];
let waitingQueue = [];
const sessions = {}; // Store user data by session ID

const characteristics = [
    "creativity", "curiosity", "judgement", "learning", "perspective", "bravery",
    "zest", "perseverance", "honesty", "intelligence", "love", "kindness",
    "social intelligence", "teamwork", "fairness", "leadership", "forgiveness",
    "humility", "prudence", "self-regulation", "appreciation", "gratitude", "hope", "humor"
];

app.set("view engine", "ejs");
app.set("views", "views");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

// Default route renders the main page
app.get("/", (req, res) => {
    res.render("render_page", { sessionId: null, page: "name_page", characteristics, waitingQueue });
});

// Render page for all steps
app.get("/render_page", (req, res) => {
    const sessionId = req.query.sessionId || null;
    const page = req.query.page || "name_page";
    res.render("render_page", { sessionId, page, characteristics, waitingQueue });
});

app.get("/render_result", (req, res) => {
    const sessionId = req.query.sessionId || null;
    const page = req.query.page || "name_page";
    const playerName = req.query.playerName;
    const top3 = req.query.top3;
    const bottom3 = req.query.bottom3;
    res.render("render_page", { sessionId, page, playerName, top3, bottom3 });
});

// Error page route
app.get("/error", (req, res) => {
    res.render("error_page", { 
        message: req.query.message || "An unexpected error occurred.",
        redirectTimeout: 30 // Timeout in seconds to redirect to the start page
    });
});

// WebSocket Logic
io.on("connection", (socket) => {
    // Check origin to ban un-authorized access.
    const origin = socket.handshake.headers.referer;
    if (!origin.includes("localhost:3000")) {
        console.log(`Connection from unauthorized origin: ${origin}`);
        socket.disconnect();
        return;
    }

    // Check for existing sessionId in the URL
    const referer = socket.handshake.headers.referer;
    const url = new URL(referer);
    const sessionId = url.searchParams.get("sessionId") || uuidv4();
    console.log(`session id: ${sessionId}`);

    // If sessionId exists, update it; otherwise, create a new session
    if (!sessions[sessionId]) {
        sessions[sessionId] = { name: null, top3: null, bottom3: null, socketId: socket.id };
    } else {
        sessions[sessionId].socketId = socket.id; // Update socket ID for reconnection
    }

    socket.emit("session-assign", { sessionId });

    // Handle page transitions and data submissions
    socket.on("navigate", (data) => {
        const { sessionId, page } = data;
        if (!sessions[sessionId]) {
            console.error(`Invalid sessionId: ${sessionId}`);
            return;
        }
        socket.emit("render", { page, sessionId, waitingQueue, characteristics });
    });

    socket.on("submit-name", (data) => {
        const { sessionId, name } = data;
        if (!sessions[sessionId]) {
            console.error(`Invalid sessionId: ${sessionId}`);
            return;
        }
        sessions[sessionId].name = name;
        addToQueue(sessionId, socket);
    });

    socket.on("submit-top3", (data) => {
        const { sessionId, top3 } = data;
        if (!sessions[sessionId]) {
            console.error(`Invalid sessionId: ${sessionId}`);
            return;
        }
        sessions[sessionId].top3 = top3;
        io.to(socket.id).emit("render", { page: "bottom3", sessionId, characteristics });
    });

    socket.on("submit-bottom3", (data) => {
        const { sessionId, bottom3 } = data;
        if (!sessions[sessionId]) {
            console.error(`Invalid sessionId: ${sessionId}`);
            return;
        }
        sessions[sessionId].bottom3 = bottom3;
        let playerName = sessions[sessionId].name;
        let top3 = sessions[sessionId].top3;
        io.to(socket.id).emit("render_result", { page: "result", sessionId, playerName, top3, bottom3 });
    });

    socket.on("error", (data) => {
        const { message } = data;
        console.error(`Error detected: ${message}`);
    });

    // Disconnect cleanup
    socket.on("disconnect", () => {
        // const sessionId = Object.keys(sessions).find(id => sessions[id].socketId === socket.id);
        // removeFromQueue(sessionId);
        // console.log(`User disconnected: ${socket.id}`);

    });

    // Utility: Add session to the appropriate queue
    function addToQueue(sessionId, socket) {
        if (processingQueue.length < MAX_PROCESSING) {
            processingQueue.push(sessionId);
            socket.emit("render", { page: "top3", sessionId, characteristics });
        } else {
            waitingQueue.push(sessionId);
            updateWaitingQueue();
            socket.emit("render", { page: "please_wait", sessionId, waitingQueue });
        }
    }

    // Utility: Remove session from the queue
    function removeFromQueue(sessionId) {
        processingQueue = processingQueue.filter(id => id !== sessionId);
        waitingQueue = waitingQueue.filter(id => id !== sessionId);
        updateWaitingQueue();
    }

    // Utility: Move from waiting to processing queue
    function promoteWaitingUser() {
        if (processingQueue.length < MAX_PROCESSING && waitingQueue.length > 0) {
            const nextSessionId = waitingQueue.shift();
            processingQueue.push(nextSessionId);
            const nextSocketId = sessions[nextSessionId].socketId;
            io.to(nextSocketId).emit("render", { page: "name_page", sessionId: nextSessionId, characteristics });
            updateWaitingQueue();
        }
    }

    // Utility: Notify all users about the updated waiting queue
    function updateWaitingQueue() {
        waitingQueue.forEach(sessionId => {
            const socketId = sessions[sessionId].socketId;
            io.to(socketId).emit("update-waiting-queue", { waitingQueue });
        });
    }

    // Delay to remove user from processing queue
    function delayRemoval(sessionId) {
        setTimeout(() => {
            removeFromQueue(sessionId);
            promoteWaitingUser();
        }, 5 * 60 * 1000);
    }
});

// Start server
server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
