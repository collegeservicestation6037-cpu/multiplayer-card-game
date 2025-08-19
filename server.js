const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let rooms = {}; // { roomCode: { players: [], deck: [], hostId, currentPlayerId, showdownPot: [] } }

// Utility: generate 4-char room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Shuffle array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Sample deck
function createDeck() {
  return shuffle([
    { name: "Card A", image_url: "/cards/cardA.png", metrics: { attack: 50, defense: 30, speed: 20 } },
    { name: "Card B", image_url: "/cards/cardB.png", metrics: { attack: 40, defense: 60, speed: 25 } },
    { name: "Card C", image_url: "/cards/cardC.png", metrics: { attack: 70, defense: 20, speed: 50 } },
    { name: "Card D", image_url: "/cards/cardD.png", metrics: { attack: 30, defense: 40, speed: 70 } },
    // Add more cards as needed
  ]);
}

// ------------------ Socket.io ------------------ //
io.on("connection", socket => {
  console.log(`New connection: ${socket.id}`);

  // Create room
  socket.on("createRoom", ({ name }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      players: [{ id: socket.id, name, hand: [] }],
      hostId: socket.id,
      currentPlayerId: null,
      showdownPot: []
    };
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode, playerId: socket.id });
  });

  // Join room
  socket.on("joinRoom", ({ name, code }) => {
    const room = rooms[code];
    if (!room) return socket.emit("error", "Room not found");
    room.players.push({ id: socket.id, name, hand: [] });
    socket.join(code);
    io.to(code).emit("updateLobby", { players: room.players, hostId: room.hostId });
    socket.emit("roomJoined", { roomCode: code, playerId: socket.id });
  });

  // Start game
  socket.on("startGame", () => {
    const roomCode = Object.keys(socket.rooms).find(r => r !== socket.id);
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;

    // Create deck & distribute equally
    const deck = createDeck();
    const playerCount = room.players.length;
    room.players.forEach((p, idx) => {
      p.hand = [];
    });
    deck.forEach((card, idx) => {
      const player = room.players[idx % playerCount];
      player.hand.push(card);
    });

    // Set first player
    room.currentPlayerId = room.players[0].id;
    io.to(roomCode).emit("gameStarted", { players: room.players, deck });
    io.to(room.currentPlayerId).emit("yourTurn", { card: room.players[0].hand[0] });
  });

  // Player chooses stat
  socket.on("chooseStat", ({ stat }) => {
    const roomCode = Object.keys(socket.rooms).find(r => r !== socket.id);
    const room = rooms[roomCode];
    if (!room || room.currentPlayerId !== socket.id) return;

    // Gather top cards from each player
    const topCards = room.players.map(p => p.hand.shift());
    let maxValue = Math.max(...topCards.map(c => c.metrics[stat]));
    let winners = topCards.filter(c => c.metrics[stat] === maxValue);

    let tie = winners.length > 1;
    if (tie) {
      room.showdownPot.push(...topCards);
    } else {
      const winnerIdx = topCards.findIndex(c => c.metrics[stat] === maxValue);
      const winnerId = room.players[winnerIdx].id;
      if (!room.winnerPiles) room.winnerPiles = {};
      if (!room.winnerPiles[winnerId]) room.winnerPiles[winnerId] = [];
      room.winnerPiles[winnerId].push(...topCards, ...room.showdownPot);
      room.showdownPot = [];
    }

    // Rotate to next player
    const currentIdx = room.players.findIndex(p => p.id === room.currentPlayerId);
    const nextIdx = (currentIdx + 1) % room.players.length;
    room.currentPlayerId = room.players[nextIdx].id;

    // Check for game over
    const activePlayers = room.players.filter(p => p.hand.length > 0 || (room.winnerPiles && room.winnerPiles[p.id]?.length));
    if (activePlayers.length === 1) {
      io.to(roomCode).emit("gameOver", { winnerName: activePlayers[0].name });
      delete rooms[roomCode];
      return;
    }

    io.to(roomCode).emit("roundResult", {
      topCards,
      currentPlayerId: room.currentPlayerId,
      players: room.players,
      tie,
      winnerId: tie ? null : room.players.findIndex(p => p.hand.length === topCards.length).id,
      cardsInRound: topCards
    });

    // Trigger next turn if next player is you
    const nextPlayer = room.players[nextIdx];
    if (nextPlayer.id === room.currentPlayerId) {
      io.to(nextPlayer.id).emit("yourTurn", { card: nextPlayer.hand[0] });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    for (const code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[code];
      } else {
        if (room.hostId === socket.id) room.hostId = room.players[0].id;
        io.to(code).emit("updateLobby", { players: room.players, hostId: room.hostId });
      }
    }
  });
});

// Start server
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
