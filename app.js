const express = require("express");
const http = require("http");
const { OpenAI } = require("openai");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Start server
server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

const DEBUG_MODE = true; // Don't call GPT in DEBUG Mode.
const MAX_PROCESSING = 2; // Max number of players in processing mode.
const ACTIVE_TIMER = 1 * 60 * 1000; // 1 minutes, after 1 min no action, current session will be marked timeout and removed.
let processingQueue = [];
let waitingQueue = [];
const sessions = {}; // Store user data by session ID
const timers = {}; // Store timers for each session

const characteristics = [
    "creativity", "curiosity", "judgement", "learning", "perspective", "bravery",
    "zest", "perseverance", "honesty", "intelligence", "love", "kindness",
    "social intelligence", "teamwork", "fairness", "leadership", "forgiveness",
    "humility", "prudence", "self-regulation", "appreciation", "gratitude", "hope", "humor"
];

app.set("view engine", "ejs");
app.set("views", "views");
app.use(express.static("views"));
app.use(bodyParser.urlencoded({ extended: true }));

// Default route renders the main page
app.get("/", (req, res) => {
    res.render("render_page", { sessionId: null, page: "name_page", characteristics, waitingQueue });
});

// Render page for all steps
app.get("/render_page", (req, res) => {
    const sessionId = req.query.sessionId || null;
    const page = req.query.page || "name_page";
    const top3 = req.query.top3 || null;
    res.render("render_page", { sessionId, page, characteristics, waitingQueue, top3 });
});

app.get("/render_result", (req, res) => {
    const sessionId = req.query.sessionId || null;
    const page = req.query.page || "name_page";
    const playerName = req.query.playerName;
    const top3 = req.query.top3;
    const bottom3 = req.query.bottom3;
    const question = req.query.question;
    res.render("render_page", { sessionId, page, playerName, top3, bottom3, question });
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
        io.to(socket.id).emit("render", { page: "bottom3", sessionId, characteristics, top3 });
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

        sessions[sessionId].bottom3 = bottom3;

        if (DEBUG_MODE) {
            const question = "debug mode placeholder question to save $$";
            io.to(socket.id).emit("render_result", {
                page: "result",
                sessionId,
                playerName,
                top3,
                bottom3,
                question
            });
            removeFromProcessingQueue(sessionId);
        } else { // Production mode.
            // Call generateInsightfulQuestion with a callback
            generateInsightfulQuestion(top3, bottom3, (error, question) => {
                if (error) {
                    socket.emit("error", { message: "Failed to generate question. Please try again later." });
                    return;
                }

                io.to(socket.id).emit("render_result", {
                    page: "result",
                    sessionId,
                    playerName,
                    top3,
                    bottom3,
                    question
                });
                removeFromProcessingQueue(sessionId);
            });
        }
    });

    socket.on("error", (data) => {
        const { message } = data;
        console.error(`Error detected: ${message}`);
    });

    // Disconnect cleanup
    socket.on("disconnect", (data) => {
        const { sessionId } = data;
        // console.log("socket disconnect data: " + data);
        if (data.includes("transport close")) { 
            removeFromProcessingQueue(sessionId);
            // console.log("socket disconnect, removed session id: " + sessionId);
        }
    });

    // Utility: Add session to the appropriate queue
    function addToQueue(sessionId, socket) {
        if (processingQueue.length < MAX_PROCESSING) {
            processingQueue.push(sessionId);
            startTimer(sessionId, socket); // Start the ACTIVE_TIMER
            socket.emit("render", { page: "top3", sessionId, characteristics: [] });
        } else {
            waitingQueue.push(sessionId);
            updateWaitingQueue();
            socket.emit("render", { page: "please_wait", sessionId, waitingQueue });
        }
        console.log("Processing queue:  " + processingQueue);
        console.log("Waiting queue:  " + waitingQueue);
    }

    // Utility: Remove session from the queue, remove user data and timer.
    function removeFromProcessingQueue(sessionId) {
        processingQueue = processingQueue.filter(id => id !== sessionId);
        clearTimer(sessionId);
        delete sessions[sessionId];
        promoteWaitingUser();
        updateWaitingQueue();
    }

    // Utility: Move from waiting to processing queue
    function promoteWaitingUser() {
        if (processingQueue.length < MAX_PROCESSING && waitingQueue.length > 0) {
            const nextSessionId = waitingQueue.shift();
            processingQueue.push(nextSessionId);
            const nextSocketId = sessions[nextSessionId].socketId;
            io.to(nextSocketId).emit("render", { page: "top3", sessionId: nextSessionId, characteristics:[] });
            startTimer(nextSessionId, io.sockets.sockets.get(nextSocketId));
            updateWaitingQueue();
        }
    }

    function updateWaitingQueue() {
        waitingQueue.forEach(sessionId => {
            const socketId = sessions[sessionId].socketId;
            io.to(socketId).emit("update-waiting-queue", { waitingQueue });
        });
    }

    // Timer Management
    function startTimer(sessionId, socket) {
        clearTimer(sessionId); // Clear existing timer if any
        timers[sessionId] = setTimeout(() => {
            // SessionT timeout: Redirect to starter page and remove all stored user data and 
            // proceed to the next waiting user.
            if (socket) {
                console.log("...session time out, redirect to start page: " + sessionId);
                const socketId = sessions[sessionId].socketId;
                io.to(socketId).emit("render", { page: "name_page", sessionId, characteristics: [] });
            }
            removeFromProcessingQueue(sessionId);
            promoteWaitingUser();
        }, ACTIVE_TIMER);
    }

    function clearTimer(sessionId) {
        if (timers[sessionId]) {
            clearTimeout(timers[sessionId]);
            delete timers[sessionId];
        }
        console.log("...timer is cleared for session id:" + sessionId);
    }

    function resetTimer(sessionId) {
        const socket = io.sockets.sockets.get(sessions[sessionId].socketId);
        startTimer(sessionId, socket);
    }
});


// GPT Logic
async function generateInsightfulQuestion(top3, bottom3, callback) {
    const prompt = `
    Given the top 3 strengths (${top3.join(", ")}) and bottom 3 strengths (${bottom3.join(", ")}) of this person, 
    can you ask an high level insightful question that can trigger their deep self-reflection? Limit to 10 words.
    `;

    openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are a insightful therapist." },
            {
                role: "user",
                content: prompt,
            },
        ],
    })
    .then(response => {
        const question = response.choices[0].message.content;
        callback(null, question); // Invoke the callback with the question
    })
    .catch(error => {
        console.error("Error generating question:", error);
        callback(error, null); // Invoke the callback with the error
    });
}