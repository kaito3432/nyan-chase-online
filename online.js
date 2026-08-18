/* にゃんチェイス Online β1
   開発用Cloudflare Worker。
   App Store公開前に API_BASE だけ差し替えればよい設計。
*/
window.NyanOnline = (() => {
  const API_BASE = "https://nyan-chase-online.honda19990602.workers.dev";

  let socket = null;
  let roomCode = "";
  let token = "";
  let player = "";

  function api(path) {
    return API_BASE.replace(/\/+$/, "") + path;
  }

  async function parseJson(response) {
    let data = null;
    try {
      data = await response.json();
    } catch (_) {}
    if (!response.ok) {
      const err = new Error(data?.error || `HTTP_${response.status}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function createRoom() {
    const response = await fetch(api("/api/rooms"), {
      method: "POST",
      headers: { "accept": "application/json" }
    });
    const data = await parseJson(response);

    roomCode = data.roomCode;
    token = data.token;
    player = data.player;

    return { roomCode, token, player };
  }

  function wsUrl(code, authToken) {
    const u = new URL(api(`/api/rooms/${code}/ws`));
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.searchParams.set("token", authToken);
    return u.toString();
  }

function connect({
  onPresence,
  onGame,
  onOpen,
  onClose,
  onError,
  onPeerDisconnected
} = {}) {
   disconnect();

    if (!roomCode || !token) {
      throw new Error("room_not_created");
    }

    socket = new WebSocket(wsUrl(roomCode, token));

    socket.addEventListener("open", () => {
      if (onOpen) onOpen();
      try {
        socket.send(JSON.stringify({ type: "ping" }));
      } catch (_) {}
    });

socket.addEventListener("message", (event) => {
  let data;

  try {
    data = JSON.parse(event.data);
  } catch (_) {
    return;
  }

  if (data.type === "presence" && onPresence) {
    onPresence(data);

  } else if (data.type === "game" && onGame) {
    onGame(data);

  } else if (
    data.type === "peerDisconnected" &&
    onPeerDisconnected
  ) {
    onPeerDisconnected(data);
  }
});

    socket.addEventListener("close", (event) => {
      if (onClose) onClose(event);
    });

    socket.addEventListener("error", (event) => {
      if (onError) onError(event);
    });

    return socket;
  }

  function disconnect() {
    if (!socket) return;
    try {
      socket.close(1000, "Leaving room");
    } catch (_) {}
    socket = null;
  }

  function reset() {
    disconnect();
    roomCode = "";
    token = "";
    player = "";
  }

  function getState() {
    return {
      roomCode,
      token,
      player,
      connected: Boolean(socket && socket.readyState === WebSocket.OPEN)
    };
  }

  return {
    API_BASE,
    createRoom,
    connect,
    disconnect,
    reset,
    getState
  };
})();
