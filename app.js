const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");
const { webcrypto } = require("crypto");
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // Middleware to parse cookies
app.set("view engine", "ejs");

const MAX_PROCESSING = 2; // Maximum number of sessions that can be processed concurrently
const ACTIVE_TIMER = 5 * 60 * 1000; // 5 minutes
const VISUAL_DISPLAY_TIMER = 10 * 60 * 1000; // 10 minutes

let processingQueue = []; // Queue for sessions being processed
let waitingQueue = []; // Queue for waiting sessions
const sessions = {}; // Store session data by `sessionId`

// Data
const characteristics = [
    "creativity", "curiosity", "judgement", "learning", "perspective", "bravery",
    "zest", "perseverance", "honesty", "intelligence", "love", "kindness",
    "social intelligence", "teamwork", "fairness", "leadership", "forgiveness",
    "humility", "prudence", "self-regulation", "appreciation", "gratitude", "hope", "humor"
];

// Middleware to assign a unique session ID to each session
app.use((req, res, next) => {
    if (!req.cookies.sessionId) {
        // Generate a new session ID
        const sessionId = uuidv4();
        res.cookie("sessionId", sessionId); // Set session ID in a cookie
        sessions[sessionId] = { name: null, top3: null, bottom3: null, timeout: null }; // Initialize session data
        req.sessionId = sessionId; // Attach sessionId to the request
    } else {
        req.sessionId = req.cookies.sessionId;
        if (!sessions[req.sessionId]) {
            // If the session ID is missing in the `sessions` object, reinitialize it
            sessions[req.sessionId] = { name: null, top3: null, bottom3: null, timeout: null };
        }
    }
    next();
});

// Utility: Add session to processing or waiting queue
const addSessionToQueue = (sessionId, res) => {
    if (processingQueue.length < MAX_PROCESSING) {
        processingQueue.push(sessionId);
        startSessionTimeout(sessionId);
        console.log("Processing Queue Updated (Client Added):", processingQueue); 
    } else {
        waitingQueue.push(sessionId);
        console.log("Waiting Queue Updated (Client Added):", waitingQueue); 
        res.render("please_wait"); // Show "Please wait..." page
    }
};

// Utility: Remove session from processin queue and update queues
const removeSessionFromQueue = (sessionId) => {
    processingQueue = processingQueue.filter((id) => id !== sessionId);
    clearTimeout(sessions[sessionId]?.timeout); // Clear the timeout
    console.log("Processing Queue Updated (Client Removed):", processingQueue); 

    // Move first session in waiting queue to processing queue
    if (waitingQueue.length > 0) {
        const nextClient = waitingQueue.shift();
        console.log("Waiting Queue Updated (Client Removed):", waitingQueue); 
        processingQueue.push(nextClient);
        console.log("Processing Queue Updated (Client Added):", processingQueue); 
        startSessionTimeout(nextClient);

        // Simulate server-side event to inform the session to reload
        sessions[nextClient].redirectToNamePage = true; // Mark for redirection
    }
};

// Utility: Start timeout for a session
const startSessionTimeout = (sessionId) => {
    // Ensure the session object exists
    if (!sessions[sessionId]) {
        sessions[sessionId] = { name: null, top3: null, bottom3: null, timeout: null };
    }

    // Clear any existing timeout for the session
    if (sessions[sessionId].timeout) {
        clearTimeout(sessions[sessionId].timeout);
    }

    // Set a timeout for the session, if user hasn't finish within 5 min, remove them from queue.
    sessions[sessionId].timeout = setTimeout(() => {
        removeSessionFromQueue(sessionId);
    }, ACTIVE_TIMER);
};

// Name Page
app.get("/", (req, res) => {
    const sessionId = req.sessionId;

    // Check if the session is waiting to be redirected
    if (sessions[sessionId]?.redirectToNamePage) {
        delete sessions[sessionId].redirectToNamePage;
        retres.render("/name_page");
    }

    if (!processingQueue.includes(sessionId) && !waitingQueue.includes(sessionId)) {
        addSessionToQueue(sessionId, res);
        res.render("name_page");
        return;
    }
});

app.post("/top3", (req, res) => {
    const sessionId = req.sessionId;
    sessions[sessionId].name = req.body.name;
    res.redirect("/top3");
});

// Top 3 Page
app.get("/top3", (req, res) => {
    res.render("top3", { characteristics });
});

app.post("/bottom3", (req, res) => {
    const sessionId = req.sessionId;
    sessions[sessionId].top3 = req.body.traits;
    res.redirect("/bottom3");
});

// Bottom 3 Page
app.get("/bottom3", (req, res) => {
    res.render("bottom3", { characteristics });
});

app.post("/result", (req, res) => {
    const sessionId = req.sessionId;
    const { name, top3, bottom3 } = JSON.parse(req.body.data);

    sessions[sessionId].name = name;
    sessions[sessionId].top3 = top3;
    sessions[sessionId].bottom3 = bottom3;
    // Clear the sessionId cookie
    res.clearCookie("sessionId");

    res.render("result", {
        name: sessions[sessionId].name,
        text: "gpt question palceholder...",
        top3: sessions[sessionId].top3,
        bottom3: sessions[sessionId].bottom3,
    });

    // Remove the session from the queue after they see the result
    removeSessionFromQueue(sessionId);
});

// Please Wait Page
app.get("/please_wait", (req, res) => {
    res.render("please_wait");
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));
