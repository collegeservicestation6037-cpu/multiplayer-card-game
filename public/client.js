const socket = io();

let playerId = null;
let roomCode = null;

// Lobby
document.getElementById("createBtn").onclick = () => {
  const name = document.getElementById("playerName").value;
  socket.emit("createRoom", { name });
};

document.getElementById("joinBtn").onclick = () => {
  const name = document.getElementById("playerName").value;
  const code = document.getElementById("roomCode").value;
  socket.emit("joinRoom", { name, code });
};

// Socket events
socket.on("roomCreated", data => {
  playerId = data.playerId;
  roomCode = data.roomCode;
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
  document.getElementById("roomInfo").innerText = `Room: ${roomCode}`;
});

socket.on("roomJoined", data => {
  playerId = data.playerId;
  roomCode = data.roomCode;
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
  document.getElementById("roomInfo").innerText = `Room: ${roomCode}`;
});

socket.on("updateLobby", data => {
  const listDiv = document.getElementById("playersList");
  listDiv.innerHTML = "<h4>Players:</h4>";
  data.players.forEach(p => listDiv.innerHTML += `<p>${p.name}</p>`);
});

socket.on("gameStarted", data => {
  console.log("Game started", data);
});

socket.on("yourTurn", data => {
  const cardArea = document.getElementById("cardArea");
  cardArea.innerHTML = `<h4>Your Card: ${data.card.name}</h4>
    <img src="${data.card.image_url}" />`;
});

document.querySelectorAll(".statBtn").forEach(btn => {
  btn.onclick = () => {
    socket.emit("chooseStat", { stat: btn.innerText.toLowerCase() });
  };
});

socket.on("roundResult", data => {
  const info = document.getElementById("roundInfo");
  info.innerHTML = `<h4>Round Cards:</h4>`;
  data.cardsInRound.forEach(c => {
    info.innerHTML += `<p>${c.name} - Attack:${c.metrics.attack}, Defense:${c.metrics.defense}, Speed:${c.metrics.speed}</p>`;
  });
});

socket.on("gameOver", data => {
  alert(`Game Over! Winner: ${data.winnerName}`);
  location.reload();
});
