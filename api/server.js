const http = require("http")
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();
const apiRoutes = require("./api");

const {setup: socketSetup} = require("../Peer/sockets.cjs")

const port = process.env.PORT || process.env.SERVER_PORT;
const clientOriginWhitelist = process.env.CLIENT_ORIGIN.split("|").map(a=>a.trim())

const app = express();

const server = http.createServer(app)
const socketIo = require("socket.io");
const userChatSocket = require("../Peer/userChatSocket.js");

app.use(express.json({ limit: "50mb" }));

const originWhitelist = process.env.CLIENT_ORIGIN.split("|").map(origin => origin.trim())

const corsOrigin = (origin, callback) => {
  if (originWhitelist.includes(origin) || !origin) {
    callback(null, true)
  } else {
    callback(new Error("Not allowed by CORS"))
  }
}

const io = new socketIo.Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  }
})

userChatSocket(io);
socketSetup({io})

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.use((req, res, next) => {
  res.secureCookie = (name, val, options = {}) => {
    res.cookie(name, val, {
      sameSite: "strict",
      httpOnly: true,
      secure: true,
      ...options,
    });
  };
  next();
});

app.get("/", (req, res) => {
  res.contentType("text/html").send("<body style='background-color: black; color: white; font-family:sans-serif;'><h1>Server is running.</h1></body>");
});

app.use(apiRoutes);

server.listen(port, () =>
  console.log(`Server listening on http://localhost:${port}`)
);

module.exports = app;
