const express = require("express");
const http = require("http");
const { OpenAI } = require("openai");
const OSC = require('node-osc');
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

// --------------- Start Server  ---------------------
server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

// ------------------- OSC --------------------------
// Create a new OSC client to send messages
// Specify the server's IP address and the port number
// Called when GPT result is back.
const oscClient = new OSC.Client('127.0.0.1', 7000);

const DEBUG_MODE = true; // Don't call GPT in DEBUG Mode.
const MAX_PROCESSING = 5; // Max number of players in processing mode.
const MAX_WAITING = 5;
const ACTIVE_TIMER = 1 * 60 * 1000; // 1 minutes, after 1 min no action, current session will be marked timeout and removed.
let sessions = {}; // Store user data by session ID
let timers = {}; // Store timers for each session
let processingQueue = [];
let waitingQueue = [];
let waitingNameQueue = [];
let flowerCount = 0;

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
    if (waitingNameQueue.length >= MAX_WAITING) {
        res.render("visit_later_page", {});
    } else {
        res.render("render_page", { sessionId: null, 
                                    page: "home_page", characteristics, waitingNameQueue });
    }
});

// Restart server in case anything wierd happened.
app.get("/reset", (req, res) => {
    sessions = {};
    timers = {};
    waitingQueue = [];
    waitingNameQueue = [];
    processingQueue = [];
    flowerCount = 0;

    res.redirect('/');
});

app.get("/enter", (req, res) => {
    res.render("render_page", { sessionId: null, page: "name_page", characteristics, waitingNameQueue });
});

// type: localhost:3000/test?index=1
app.get("/test", (req, res) => {
    const index = parseInt(req.query.index) || 0;
    testRender(res, index);
});

// Test function.
function testRender(res, index) {
    const testTop3 =  "curiosity,creativity,humor";
    const testBottom3 = "leadership,forgiveness,fairness";
    switch (index) {
        case 0:
            res.render("render_page", { sessionId: null, page: "name_page", characteristics, waitingNameQueue });
            break;
        case 1: // top3
            res.render("render_page", { sessionId: null, page: "top3", characteristics, waitingNameQueue });
            break;
        case 2: // bottom3
            res.render("render_page", { sessionId: null, page: "bottom3", characteristics, waitingNameQueue });
            break;
        case 3: // wait result
            res.render("render_page", { sessionId: null, page: "wait_result", characteristics, waitingNameQueue, top3: null });
            break;
        case 4: // result
            const testQuestion = "Are you afraid that opening up to others might make you lose \
                          the freedom that keeps you feeling safe?";
            const testPlayerName = "test-vio";
            const flowerTypeABC = sendResultToUEViaOSC(testPlayerName, testQuestion, testTop3, testBottom3);
            const flowerMap = { A: 'flower1', B: 'flower2', C: 'flower3'};
            const flowerType = flowerMap[flowerTypeABC];
            res.render("render_page", { sessionId: "123", page:"result", playerName: testPlayerName, 
                top3: testTop3, bottom3: testBottom3, 
                question: testQuestion, flowerType: flowerType });
            break;
        case 5: // queue
            waitingNameQueue = ["Vio", "Lois", "John", "Lilian"];
            res.render("render_page", { sessionId: null, page: "please_wait", waitingNameQueue, top3: null });  
            break;
        case 6: // error
            res.render("error_page", { 
                message: "An unexpected error occurred.",
                redirectTimeout: 30 // Timeout in seconds to redirect to the start page
            });
            break;
    }
}

// Render page for all steps
app.get("/render_page", (req, res) => {
    const sessionId = req.query.sessionId || null;
    const page = req.query.page || "name_page";
    const top3 = req.query.top3 || null;
    res.render("render_page", { sessionId, page, characteristics, waitingNameQueue, top3 });
});

app.get("/render_result", (req, res) => {
    const sessionId = req.query.sessionId || null;
    const page = req.query.page || "name_page";
    const playerName = req.query.playerName;
    const top3 = req.query.top3;
    const bottom3 = req.query.bottom3;
    const question = req.query.question;
    const flowerType = req.query.flowerType;
    res.render("render_page", { sessionId, page, playerName, top3, bottom3, question, flowerType });
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
    // if (!origin.includes("localhost:3000")) {
    //     console.log(`Connection from unauthorized origin: ${origin}`);
    //     socket.disconnect();
    //     return;
    // }

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
        socket.emit("render", { page, sessionId, waitingNameQueue, characteristics });
    });

    socket.on("submit-name", (data) => {
        const { sessionId, name } = data;
        if (!sessions[sessionId]) {
            console.error(`Invalid sessionId: ${sessionId}`);
            return;
        }
        sessions[sessionId].name = name;
        addToQueue(sessionId, socket, name);
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
            const flowerType = sendResultToUEViaOSC(playerName, question, top3.join(","), bottom3.join(","));
            io.to(socket.id).emit("render_result", {
                page: "result",
                sessionId,
                playerName,
                top3,
                bottom3,
                question,
                flowerType
            });
            removeFromProcessingQueue(sessionId);
        } else { // Production mode.
            // Call generateInsightfulQuestion with a callback
            generateInsightfulQuestion(top3, bottom3, (error, question) => {
                if (error) {
                    socket.emit("error", { message: "Failed to generate question. Please try again later." });
                    return;
                }
                const flowerType = sendResultToUEViaOSC(playerName, question, top3.join(","), bottom3.join(","));
                io.to(socket.id).emit("render_result", {
                    page: "result",
                    sessionId,
                    playerName,
                    top3,
                    bottom3,
                    question,
                    flowerType
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
    function addToQueue(sessionId, socket, name) {
        if (processingQueue.length < MAX_PROCESSING) {
            processingQueue.push(sessionId);
            startTimer(sessionId, socket); // Start the ACTIVE_TIMER
            socket.emit("render", { page: "top3", sessionId, characteristics: [] });
        } else {
            waitingQueue.push(sessionId);
            waitingNameQueue.push(name);
            updateWaitingQueue();
            socket.emit("render", { page: "please_wait", sessionId, waitingNameQueue });
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
            waitingNameQueue.shift();
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
            io.to(socketId).emit("update-waiting-queue", { waitingNameQueue });
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


// ------------------- GPT --------------------------

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

// ------------------- OSC --------------------------

function sendResultToUEViaOSC(playerName, question, top3, bottom3) {
    const top3array = top3.split(",");
    const bottom3array = bottom3.split(",");
    const flowerTypeArray = ["A", "B", "C"];
    
    const flowerIndex = flowerCount % 3; // 3 is number type of flower in total.
    const flowerType = flowerTypeArray[flowerIndex];
    let flowerRound = Math.floor(flowerCount / 3);

    let shouldRestart = false;
    // If flower reaches 6, restart the game
    if (flowerCount >= 6) {
        flowerCount = 0;
        flowerRound = Math.floor(flowerCount / 3);
        shouldRestart = true;
    }

    // Send gpt responded question + player name to UE via OSC
    const message = new OSC.Message(
        '/player-name', playerName, 
        '/question', question,
        '/top3-0', top3array[0],
        '/top3-1', top3array[1],
        '/top3-2', top3array[2],
        '/bottom3-0', bottom3array[0],
        '/bottom3-1', bottom3array[0],
        '/bottom3-2', bottom3array[0],
        '/flower-type', flowerType,
        '/restart', shouldRestart,
        '/round', flowerRound
    );
    console.log('flower round: ' + flowerRound);
    oscClient.send(message, (error) => {
        if (error) {
            console.error('Error sending OSC message:', error);
        }
    });
    // Send the first flower OSC again to avoid UE level restart bug.
    if (shouldRestart) {
        const message2 = new OSC.Message(
            '/player-name', playerName, 
            '/question', question,
            '/top3-0', top3array[0],
            '/top3-1', top3array[1],
            '/top3-2', top3array[2],
            '/bottom3-0', bottom3array[0],
            '/bottom3-1', bottom3array[0],
            '/bottom3-2', bottom3array[0],
            '/flower-type', flowerType,
            '/restart', false,
            '/round', flowerRound
        );
        setTimeout(() => {
            oscClient.send(message2, (error) => {
                if (error) {
                    console.error('Error sending OSC message:', error);
                }
            });
        }, 3000);
    }
    flowerCount += 1;
    return flowerType;
};