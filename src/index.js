require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const leaderboardsRoutes = require("./routes/leaderboards");
const gameRoutes       = require("./routes/game");
const tournamentRoutes  = require("./routes/tournament");

const app = express();

const PORT = process.env.PORT || 3000;

/* ==============================
   Middleware
============================== */

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json());

/* Request logger */

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.use(express.static("Frontend"));
/* ==============================
   REST API Routes
============================== */

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/leaderboards", leaderboardsRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/tournament", tournamentRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "poker-trainer-api"
  });
});



/* ==============================
   Serve Frontend
============================== */

const frontendPath = path.join(__dirname, "..", "..", "Frontend");

app.use(express.static(frontendPath));

// Only serve index.html for "/" (NOT for every unknown route)
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ==============================
   HTTP Server
============================== */

const server = http.createServer(app);

/* ==============================
   WebSocket Server
============================== */

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

/* Track clients */

const clients = new Map();

/* WebSocket Connection */

wss.on("connection", (ws) => {

  console.log("WebSocket connected");

  ws.send(JSON.stringify({
    type: "welcome",
    message: "Connected to Poker Trainer WS"
  }));

  ws.on("message", async (raw) => {

    try {

      const msg = JSON.parse(raw.toString());

      /* HELLO */

      if (msg.type === "hello") {

        clients.set(ws, {
          userId: msg.userId || null,
          sessionId: null
        });

        ws.send(JSON.stringify({
          type: "hello_ack",
          ok: true
        }));

        return;
      }

      /* PING */

      if (msg.type === "ping") {

        ws.send(JSON.stringify({
          type: "pong"
        }));

        return;
      }

      /* SIMPLE BROADCAST */

      if (msg.type === "broadcast") {

        for (const client of wss.clients) {

          if (client.readyState === WebSocket.OPEN) {

            client.send(JSON.stringify({
              type: "broadcast",
              from: msg.userId,
              message: msg.message
            }));

          }

        }

        return;

      }

      ws.send(JSON.stringify({
        type: "error",
        error: "Unknown message type"
      }));

    } catch (err) {

      ws.send(JSON.stringify({
        type: "error",
        error: err.message
      }));

    }

  });

  ws.on("close", () => {

    console.log("WebSocket disconnected");

    clients.delete(ws);

  });

});

/* ==============================
   Global Error Handler
============================== */

app.use((err, req, res, next) => {

  console.error("Server Error:", err);

  res.status(500).json({
    error: "Internal Server Error"
  });

});

/* ==============================
   Start Server
============================== */

server.listen(PORT, () => {

  console.log(`Poker Trainer API running at http://localhost:${PORT}`);

  console.log(`WebSocket running at ws://localhost:${PORT}/ws`);

});