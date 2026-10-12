
const express = require("express");
const path = require("path");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "server.key")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "server.crt"))
};

const server = https.createServer(httpsOptions, app);
const io = new Server(server);

const PORT = 3000;
const roomStates = new Map();
const PIN_PATTERN = /^[A-Za-z0-9]{6}$/;
const PENDING_REQUEST_TTL_MS = 30 * 60 * 1000;

function isValidPin(pin) {

  return (
    typeof pin === "string" &&
    PIN_PATTERN.test(pin)
  );

}

function getRoomState(roomId) {

  if (!roomId) {
    return null;
  }

  if (!roomStates.has(roomId)) {

    roomStates.set(roomId, {
      pending: new Map(),
      pendingTimers: new Map(),
      approved: new Map(),
      active: new Map(),
      members: new Map(),
      presenterSocketId: null,
      nextJoinOrder: 1
    });

  }

  return roomStates.get(roomId);

}

function clearPendingRequestTimer(room, socketId) {

  const timer = room.pendingTimers.get(socketId);

  if (timer) {
    clearTimeout(timer);
    room.pendingTimers.delete(socketId);
  }

}


function expirePendingViewerRequest(roomId, room, socketId, member) {

  if (room.pending.get(socketId) !== member) {
    return;
  }

  clearPendingRequestTimer(room, socketId);
  room.pending.delete(socketId);
  room.members.delete(socketId);

  io.to(socketId).emit(
    "viewer-request-expired",
    {
      message:
        "Your approval request expired after 30 minutes. Return to the main screen and select Viewer to request again."
    }
  );

  if (room.presenterSocketId) {
    io.to(room.presenterSocketId).emit(
      "viewer-request-expired",
      {
        socketId,
        name: member.name
      }
    );
  }

  console.log(
    `Viewer request expired: ${socketId} in ${roomId}`
  );

  if (
    room.pending.size === 0 &&
    room.approved.size === 0 &&
    !room.presenterSocketId
  ) {
    roomStates.delete(roomId);
  }

}


function broadcastActiveViewers(roomId) {

  const room = roomStates.get(roomId);

  if (!room || !room.presenterSocketId) {
    return;
  }

  io.to(room.presenterSocketId).emit(
    "active-viewers-update",
    {
      viewers: Array.from(room.active.values())
    }
  );

}

function removeSocketFromRoom(roomId, socketId) {

  if (!roomId) {
    return;
  }

  const room = roomStates.get(roomId);

  if (!room) {
    return;
  }

  clearPendingRequestTimer(room, socketId);
  room.pending.delete(socketId);
  room.approved.delete(socketId);
  room.active.delete(socketId);
  room.members.delete(socketId);

  if (
    room.pending.size === 0 &&
    room.approved.size === 0 &&
    !room.presenterSocketId
  ) {
    roomStates.delete(roomId);
  }

}

// ==========================================
// PRESENTER PIN
// ==========================================

const SCREEN_SHARE_PIN = process.env.SCREEN_SHARE_PIN;

if (
  !SCREEN_SHARE_PIN ||
  !isValidPin(SCREEN_SHARE_PIN)
) {
  console.error(
    "ERROR: SCREEN_SHARE_PIN must be exactly 6 characters using only numbers or letters."
  );

  process.exit(1);
}

// ==========================================
// EXPRESS
// ==========================================

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ==========================================
// SOCKET.IO
// ==========================================

io.on("connection", (socket) => {

  console.log(
    "Connected:",
    socket.id
  );


  // ========================================
  // PRESENTER AUTHENTICATION
  // ========================================

  socket.on(
    "authenticate-presenter",
    ({ pin }) => {

      if (
        !isValidPin(pin) ||
        pin.toUpperCase() !==
          SCREEN_SHARE_PIN.toUpperCase()
      ) {

        socket.emit(
          "presenter-auth-result",
          {
            success: false,
            message: "Incorrect PIN"
          }
        );

        return;
      }


      // Authentication successful

      socket.data.authenticatedPresenter =
        true;


      socket.emit(
        "presenter-auth-result",
        {
          success: true
        }
      );


      console.log(
        "Presenter authenticated:",
        socket.id
      );

    }
  );


  // ========================================
  // JOIN ROOM
  // ========================================

  socket.on(
    "join-room",
    ({ roomId, role, name }) => {

      if (
        !roomId ||
        !role
      ) {
        return;
      }


      // Presenter must authenticate

      if (
        role === "presenter" &&
        !socket.data.authenticatedPresenter
      ) {

        socket.emit(
          "auth-required"
        );

        return;
      }


      socket.data.role =
        role;

      socket.data.roomId =
        roomId;

      socket.join(roomId);

      console.log(
        `${socket.id} joined ${roomId} as ${role}`
      );

      if (role === "presenter") {

        const room = getRoomState(roomId);
        room.presenterSocketId = socket.id;

        socket.emit(
          "presenter-room-ready",
          {
            roomId
          }
        );

        room.pending.forEach((viewer, viewerSocketId) => {
          if (Date.now() - viewer.joinedAt >= PENDING_REQUEST_TTL_MS) {
            expirePendingViewerRequest(
              roomId,
              room,
              viewerSocketId,
              viewer
            );
            return;
          }

          socket.emit(
            "viewer-request",
            {
              socketId: viewerSocketId,
              name: viewer.name
            }
          );
        });

        return;
      }


      if (role === "viewer") {

        const room = getRoomState(roomId);
        const requestedName =
          typeof name === "string"
            ? name.trim()
            : "";

        if (!requestedName) {

          socket.emit(
            "viewer-join-error",
            {
              message:
                "Please enter your name before joining."
            }
          );

          return;
    
        }

        const displayName = requestedName;

        if (displayName.length > 50) {

          socket.emit(
            "viewer-join-error",
            {
              message:
                "Please enter a valid name before joining."
            }
          );

          return;
        }

        const member = {
          socketId: socket.id,
          name: displayName,
          joinOrder: room.nextJoinOrder,
          joinedAt: Date.now()
        };

        room.members.set(socket.id, member);
        room.pending.set(socket.id, member);
        clearPendingRequestTimer(room, socket.id);

        const pendingTimer = setTimeout(() => {
          expirePendingViewerRequest(
            roomId,
            room,
            socket.id,
            member
          );
        }, PENDING_REQUEST_TTL_MS);

        room.pendingTimers.set(socket.id, pendingTimer);

        room.nextJoinOrder += 1;

        room.approved.delete(socket.id);

        socket.data.viewerName =
          displayName;

        socket.emit(
          "viewer-status",
          {
            status: "pending-approval",
            message:
              `Waiting for host approval... You are ${displayName}.`
          }
        );

        if (room.presenterSocketId) {

          io.to(room.presenterSocketId).emit(
            "viewer-request",
            {
              socketId: socket.id,
              name: displayName
            }
          );

        }

      }

    }
  );


  // ========================================
  // APPROVE / REJECT VIEWER
  // ========================================

  socket.on(
    "approve-viewer",
    ({ roomId, viewerSocketId }) => {

      if (
        socket.data.role !== "presenter" ||
        !socket.data.authenticatedPresenter ||
        socket.data.roomId !== roomId
      ) {
        return;
      }

      const room = getRoomState(roomId);

      if (!room) {
        return;
      }

      const pendingViewer =
        room.pending.get(viewerSocketId) || room.members.get(viewerSocketId);

      if (!pendingViewer) {
        return;
      }

      clearPendingRequestTimer(room, viewerSocketId);
      room.pending.delete(viewerSocketId);
      room.approved.set(viewerSocketId, pendingViewer);
      room.active.set(viewerSocketId, pendingViewer);

      io.to(viewerSocketId).emit(
        "viewer-approved",
        {
          roomId,
          name: pendingViewer.name
        }
      );

      io.to(roomId).emit(
        "viewer-joined",
        {
          socketId: viewerSocketId,
          name: pendingViewer.name
        }
      );

      broadcastActiveViewers(roomId);

      console.log(
        `Viewer approved: ${viewerSocketId} in ${roomId}`
      );

    }
  );


  socket.on(
    "reject-viewer",
    ({ roomId, viewerSocketId }) => {

      if (
        socket.data.role !== "presenter" ||
        !socket.data.authenticatedPresenter ||
        socket.data.roomId !== roomId
      ) {
        return;
      }

      const room = getRoomState(roomId);

      if (!room) {
        return;
      }

      const pendingViewer =
        room.pending.get(viewerSocketId);

      if (!pendingViewer) {
        return;
      }

      clearPendingRequestTimer(room, viewerSocketId);
      room.pending.delete(viewerSocketId);
      room.active.delete(viewerSocketId);
      room.members.delete(viewerSocketId);

      io.to(viewerSocketId).emit(
        "viewer-rejected",
        {
          roomId,
          message:
            "Host rejected your request to join this session."
        }
      );

      io.to(socket.id).emit(
        "viewer-declined-host",
        {
          socketId: viewerSocketId,
          name: pendingViewer.name
        }
      );

    }
  );


  // ========================================
  // WEBRTC OFFER
  // ========================================

  socket.on(
    "offer",
    ({ target, offer }) => {

      if (
        socket.data.role !==
          "presenter" ||
        !socket.data.authenticatedPresenter
      ) {

        return;
      }


      io.to(target).emit(
        "offer",
        {
          from: socket.id,
          offer
        }
      );

    }
  );


  // ========================================
  // WEBRTC ANSWER
  // ========================================

  socket.on(
    "answer",
    ({ target, answer }) => {

      if (
        socket.data.role !==
        "viewer"
      ) {

        return;
      }


      io.to(target).emit(
        "answer",
        {
          from: socket.id,
          answer
        }
      );

    }
  );


  // ========================================
  // ICE CANDIDATE
  // ========================================

  socket.on(
    "ice-candidate",
    ({ target, candidate }) => {

      if (
        socket.data.role !==
          "presenter" &&
        socket.data.role !==
          "viewer"
      ) {

        return;
      }


      io.to(target).emit(
        "ice-candidate",
        {
          from: socket.id,
          candidate
        }
      );

    }
  );


  // ========================================
  // LEAVE ROOM / LOGOUT
  // ========================================

  socket.on(
    "remove-viewer",
    ({ roomId, viewerSocketId }) => {

      if (
        socket.data.role !== "presenter" ||
        !socket.data.authenticatedPresenter ||
        socket.data.roomId !== roomId
      ) {
        return;
      }

      const room = getRoomState(roomId);

      if (!room) {
        return;
      }

      const viewer =
        room.approved.get(viewerSocketId) ||
        room.active.get(viewerSocketId) ||
        room.members.get(viewerSocketId);

      if (!viewer) {
        return;
      }

      room.approved.delete(viewerSocketId);
      room.active.delete(viewerSocketId);
      room.members.delete(viewerSocketId);

      io.to(viewerSocketId).emit(
        "viewer-removed",
        {
          roomId,
          message:
            "You were removed from this session by the host."
        }
      );

      broadcastActiveViewers(roomId);

      console.log(
        `Viewer removed by host: ${viewerSocketId} from ${roomId}`
      );

    }
  );


  socket.on(
    "host-ended-session",
    ({ roomId, reason }) => {

      if (
        socket.data.role !== "presenter" ||
        !socket.data.authenticatedPresenter ||
        socket.data.roomId !== roomId
      ) {
        return;
      }

      const room =
        roomStates.get(roomId);

      if (room) {

        room.pendingTimers.forEach(timer => clearTimeout(timer));
        room.pendingTimers.clear();
        room.pending.clear();
        room.approved.clear();
        room.active.clear();
        room.members.clear();
        room.presenterSocketId = null;

      }

      io.to(roomId).emit(
        "session-ended",
        {
          reason:
            reason ||
            "Host ended the session."
        }
      );

      console.log(
        `Session ended by host for room ${roomId}`
      );

    }
  );


  socket.on(
    "leave-room",
    () => {

      const roomId =
        socket.data.roomId;


      if (roomId) {

        const room =
          roomStates.get(roomId);

        if (room) {

          if (
            socket.data.role === "viewer"
          ) {

            clearPendingRequestTimer(room, socket.id);
            room.pending.delete(socket.id);
            room.approved.delete(socket.id);
            room.active.delete(socket.id);
            room.members.delete(socket.id);

            io.to(roomId).emit(
              "viewer-left",
              {
                socketId: socket.id
              }
            );

            broadcastActiveViewers(roomId);

          }

          if (
            socket.data.role === "presenter"
          ) {

            room.presenterSocketId = null;

          }

          if (
            room.pending.size === 0 &&
            room.approved.size === 0 &&
            !room.presenterSocketId
          ) {
            roomStates.delete(roomId);
          }

        }

        socket.leave(roomId);

      }


      socket.data.roomId =
        null;

      socket.data.role =
        null;

      socket.data.authenticatedPresenter =
        false;

      socket.data.viewerName =
        null;


      console.log(
        "Left room:",
        socket.id
      );

    }
  );


  // ========================================
  // DISCONNECT
  // ========================================

  socket.on(
    "disconnect",
    () => {

      const roomId =
        socket.data.roomId;

      if (roomId) {

        const room =
          roomStates.get(roomId);

        if (room) {

          if (
            socket.data.role === "viewer"
          ) {

            clearPendingRequestTimer(room, socket.id);
            room.pending.delete(socket.id);
            room.approved.delete(socket.id);
            room.active.delete(socket.id);
            room.members.delete(socket.id);

            io.to(roomId).emit(
              "viewer-left",
              {
                socketId: socket.id
              }
            );

            broadcastActiveViewers(roomId);

          }

          if (
            socket.data.role === "presenter"
          ) {

            room.presenterSocketId = null;

          }

          if (
            room.pending.size === 0 &&
            room.approved.size === 0 &&
            !room.presenterSocketId
          ) {
            roomStates.delete(roomId);
          }

        }

      }

      console.log(
        "Disconnected:",
        socket.id
      );

    }
  );

});


// ==========================================
// START SERVER
// ==========================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `TV Screen Share server running on port ${PORT}`
    );

  }
);
