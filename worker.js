import { DurableObject } from "cloudflare:workers";

const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function makeRoomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 部屋作成
    if (url.pathname === "/internal/init" && request.method === "POST") {
      const room = await this.ctx.storage.get("room");

      if (room) {
        return json({ ok: false, error: "room_exists" }, 409);
      }

      const hostToken = crypto.randomUUID();

await this.ctx.storage.put("room", {
  createdAt: Date.now(),
  hostToken,
  guestToken: null,
  roles: null,

secretCat: {
  pos: null,
  history: [],
  turn: 0,

  // 忍び足で足跡を残さない箱
  noTrackBoxes: [],
},

  publicFoundTracks: [],
});

      return json({
        ok: true,
        player: "host",
        token: hostToken,
      });
    }

    // 2人目が参加
    if (url.pathname === "/internal/join" && request.method === "POST") {
      const room = await this.ctx.storage.get("room");

      if (!room) {
        return json({ ok: false, error: "room_not_found" }, 404);
      }

      if (room.guestToken) {
        return json({ ok: false, error: "room_full" }, 409);
      }

      const guestToken = crypto.randomUUID();

      room.guestToken = guestToken;
      await this.ctx.storage.put("room", room);

      return json({
        ok: true,
        player: "guest",
        token: guestToken,
      });
    }

    // WebSocket接続
    if (url.pathname === "/internal/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const room = await this.ctx.storage.get("room");
      const token = url.searchParams.get("token");

      if (!room || !token) {
        return new Response("Unauthorized", { status: 401 });
      }

      let player = null;

      if (token === room.hostToken) {
        player = "host";
      } else if (token === room.guestToken) {
        player = "guest";
      }

      if (!player) {
        return new Response("Unauthorized", { status: 401 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // 同じプレイヤーの古い接続があれば閉じる
      for (const socket of this.ctx.getWebSockets()) {
        const info = socket.deserializeAttachment();

        if (info?.player === player) {
          try {
            socket.close(1000, "Reconnected");
          } catch (_) {}
        }
      }

      server.serializeAttachment({ player });

      // Hibernation対応WebSocket
      this.ctx.acceptWebSocket(server, [player]);

      await this.broadcastPresence();

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // 状態確認
    if (url.pathname === "/internal/status") {
      const room = await this.ctx.storage.get("room");

      if (!room) {
        return json({ ok: false, error: "room_not_found" }, 404);
      }

      return json({
        ok: true,
        guestJoined: Boolean(room.guestToken),
        connectedPlayers: this.connectedPlayers(),
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  connectedPlayers() {
    const players = new Set();

    for (const socket of this.ctx.getWebSockets()) {
      const info = socket.deserializeAttachment();

      if (info?.player) {
        players.add(info.player);
      }
    }

    return [...players];
  }

async broadcastPresence() {
  const players = this.connectedPlayers();

  const ready =
    players.includes("host") &&
    players.includes("guest");

  const message = JSON.stringify({
    type: "presence",
    players,
    count: players.length,
    ready,
  });

  for (const socket of this.ctx.getWebSockets()) {
    try {
      socket.send(message);
    } catch (_) {}
  }

  // 2人そろったら役割を決定・通知
  if (ready) {
    await this.assignRoles();
  }
}

  async assignRoles() {
  const room = await this.ctx.storage.get("room");

  if (!room) return;

  // まだ役割が決まっていなければ1度だけ抽選
  if (!room.roles) {
    const hostIsCat =
      crypto.getRandomValues(new Uint32Array(1))[0] % 2 === 0;

    room.roles = {
      host: hostIsCat ? "cat" : "police",
      guest: hostIsCat ? "police" : "cat",
    };

    await this.ctx.storage.put("room", room);
  }

  // 各プレイヤーへ自分の役割だけ通知
  for (const socket of this.ctx.getWebSockets()) {
    const info = socket.deserializeAttachment();
    const player = info?.player;

    if (!player) continue;

    const role = room.roles[player];

    try {
      socket.send(
        JSON.stringify({
          type: "role",
          player,
          role,
          opponentRole:
            role === "cat" ? "police" : "cat",
        })
      );
    } catch (_) {}
  }
}

  sendToRole(role, data) {
  const message = JSON.stringify(data);

  for (const socket of this.ctx.getWebSockets()) {
    const info = socket.deserializeAttachment();

    if (info?.player !== role) continue;

    try {
      socket.send(message);
    } catch (_) {}
  }
}

  playerForRole(room, wantedRole) {
  if (!room?.roles) return null;

  if (room.roles.host === wantedRole) {
    return "host";
  }

  if (room.roles.guest === wantedRole) {
    return "guest";
  }

  return null;
}

 async webSocketMessage(ws, message) {
  let data;

  try {
    data = JSON.parse(message);
  } catch (_) {
    return;
  }

  const sender = ws.deserializeAttachment()?.player;

  if (!sender) return;

  // 接続確認
  if (data.type === "ping") {
    ws.send(
      JSON.stringify({
        type: "pong",
        player: sender,
        time: Date.now(),
      })
    );

    return;
  }

  if (data.type !== "game") {
    return;
  }

  const payload = data.payload ?? {};
  const room = await this.ctx.storage.get("room");

  if (!room || !room.roles) {
    return;
  }

  const senderRole = room.roles[sender];

  /*
   * ==========================================
   * ネコ：初期位置
   * ==========================================
   *
   * catPosはCloudflareだけが保存。
   * 警察には位置番号を送らない。
   */
  if (payload.type === "catSetup") {
    if (senderRole !== "cat") return;

    const catPos = Number(payload.catPos);

    if (
      !Number.isInteger(catPos) ||
      catPos < 0 ||
      catPos >= 25
    ) {
      return;
    }

room.secretCat = {
  pos: catPos,
  turn: 1,

  history: [
    {
      box: catPos,
      turn: 1,
    },
  ],

  // 忍び足で消した足跡
  noTrackBoxes: [],
};

    await this.ctx.storage.put("room", room);

    const policePlayer =
      this.playerForRole(room, "police");

    if (policePlayer) {
      this.sendToRole(policePlayer, {
        type: "game",
        from: "server",
        payload: {
          type: "catSetupDone",
          turn: 1,
        },
      });
    }

    // ネコ本人へ保存完了通知
    ws.send(
      JSON.stringify({
        type: "game",
        from: "server",
        payload: {
          type: "catSetupAccepted",
          turn: 1,
        },
      })
    );

    return;
  }

  /*
   * ==========================================
   * ネコ：通常移動
   * ==========================================
   *
   * 移動先もCloudflareだけが保持。
   */
  if (payload.type === "catMove") {
    if (senderRole !== "cat") return;

    const catPos = Number(payload.catPos);
    const turn = Number(payload.turn);

    const sneakUsed = payload.sneakUsed === true;
const noTrackBox = Number(payload.noTrackBox);

    if (
      !Number.isInteger(catPos) ||
      catPos < 0 ||
      catPos >= 25 ||
      !Number.isInteger(turn) ||
      turn < 1 ||
      turn > 11
    ) {
      return;
    }

if (!room.secretCat) {
  room.secretCat = {
    pos: null,
    history: [],
    turn: 0,
    noTrackBoxes: [],
  };
}

    if (!Array.isArray(room.secretCat.noTrackBoxes)) {
  room.secretCat.noTrackBoxes = [];
}

if (
  sneakUsed &&
  Number.isInteger(noTrackBox) &&
  noTrackBox >= 0 &&
  noTrackBox < 25 &&
  !room.secretCat.noTrackBoxes.includes(noTrackBox)
) {
  room.secretCat.noTrackBoxes.push(noTrackBox);
}
    room.secretCat.pos = catPos;
    room.secretCat.turn = turn;

    if (!Array.isArray(room.secretCat.history)) {
      room.secretCat.history = [];
    }

    room.secretCat.history.push({
      box: catPos,
      turn,
    });

    await this.ctx.storage.put("room", room);

    const policePlayer =
      this.playerForRole(room, "police");

    if (policePlayer) {
      this.sendToRole(policePlayer, {
        type: "game",
        from: "server",
        payload: {
          type: "catMoveDone",
          turn,
        },
      });
    }

    return;
  }

   if (payload.type === "search") {
  if (senderRole !== "police") return;

  const box = Number(payload.box);
  const dogIndex = Number(payload.dogIndex);

  if (
    !Number.isInteger(box) ||
    box < 0 ||
    box >= 25 ||
    !Number.isInteger(dogIndex) ||
    dogIndex < 0 ||
    dogIndex >= 3
  ) {
    return;
  }
     const catPlayer = this.playerForRole(room, "cat");

if (catPlayer) {
  this.sendToRole(catPlayer, {
    type: "game",
    from: "server",
    payload: {
      type: "policeSearch",
      dogIndex,
      box,
    },
  });
}

  const secretCat = room.secretCat;

  if (!secretCat || secretCat.pos === null) {
    return;
  }

let result = "empty";
let trackTurn = null;

if (box === secretCat.pos) {

  // 現在ネコがいる箱なら、忍び足に関係なく捕獲
  result = "capture";

} else if (Array.isArray(secretCat.history)) {

  // 忍び足によって足跡を残さなかった箱か
  const noTrack =
    Array.isArray(secretCat.noTrackBoxes) &&
    secretCat.noTrackBoxes.includes(box);

  if (!noTrack) {

    const found =
      secretCat.history.find(h => h.box === box);

    if (found) {
      result = "track";
      trackTurn = found.turn;
    }
  }
}
     
let foundTrackCount = Array.isArray(room.publicFoundTracks)
  ? room.publicFoundTracks.length
  : 0;

if (result === "track") {
  if (!Array.isArray(room.publicFoundTracks)) {
    room.publicFoundTracks = [];
  }

  if (!room.publicFoundTracks.includes(box)) {
    room.publicFoundTracks.push(box);
    await this.ctx.storage.put("room", room);
  }

  foundTrackCount = room.publicFoundTracks.length;

  const catPlayer = this.playerForRole(room, "cat");

if (catPlayer) {
  this.sendToRole(catPlayer, {
    type: "game",
    from: "server",
payload: {
  type: "trackCount",
  count: foundTrackCount,
  box,
  trackTurn,
},
  });
}
}
     const route =
  result === "capture" && Array.isArray(secretCat.history)
    ? secretCat.history
        .map(step => ({
          box: Number(step.box),
          turn: Number(step.turn),
        }))
        .filter(step =>
          Number.isInteger(step.box) &&
          step.box >= 0 &&
          step.box < 25 &&
          Number.isInteger(step.turn)
        )
        .sort((a,b)=>a.turn-b.turn)
    : null;

 // 警察側へ探索結果を返す
ws.send(
  JSON.stringify({
    type: "game",
    from: "server",
payload: {
  type: "searchResult",
  dogIndex,
  box,
  result,
  trackTurn,
  route,
},
  })
);

// ネコを捕獲した場合は、ネコ側にもゲーム終了を通知
if (result === "capture") {
  const catPlayer = this.playerForRole(room, "cat");

  if (catPlayer) {
    this.sendToRole(catPlayer, {
      type: "game",
      from: "server",
      payload: {
        type: "captured",
        dogIndex,
        box,
      },
    });
  }
}

return;
}
   if (payload.type === "catNoEscape") {
  if (senderRole !== "cat") return;

  const route = Array.isArray(room.secretCat?.history)
    ? room.secretCat.history
        .map(step => ({
          box: Number(step.box),
          turn: Number(step.turn),
        }))
        .filter(step =>
          Number.isInteger(step.box) &&
          step.box >= 0 &&
          step.box < 25 &&
          Number.isInteger(step.turn)
        )
        .sort((a,b)=>a.turn-b.turn)
    : [];

  const policePlayer =
    this.playerForRole(room, "police");

  if (policePlayer) {
    this.sendToRole(policePlayer, {
      type: "game",
      from: "server",
      payload: {
        type: "catNoEscape",
        turn: Number(payload.turn),
        route,
      },
    });
  }

  return;
}
   if (payload.type === "catEscaped") {
  if (senderRole !== "cat") return;

  const route = Array.isArray(room.secretCat?.history)
    ? room.secretCat.history
        .map(step => ({
          box: Number(step.box),
          turn: Number(step.turn),
        }))
        .filter(step =>
          Number.isInteger(step.box) &&
          step.box >= 0 &&
          step.box < 25 &&
          Number.isInteger(step.turn)
        )
        .sort((a,b)=>a.turn-b.turn)
    : [];

  const policePlayer =
    this.playerForRole(room, "police");

  if (policePlayer) {
    this.sendToRole(policePlayer, {
      type: "game",
      from: "server",
      payload: {
        type: "catEscaped",
        turn: Number(payload.turn),
        route,
      },
    });
  }

  return;
}

  /*
   * ==========================================
   * その他のゲーム情報
   * ==========================================
   *
   * dogSetup / dogMove / ready などは
   * 今までどおり相手へ中継。
   */
  const outgoing = JSON.stringify({
    type: "game",
    from: sender,
    payload,
  });

  for (const socket of this.ctx.getWebSockets()) {
    if (socket === ws) continue;

    try {
      socket.send(outgoing);
    } catch (_) {}
  }
}

async webSocketClose(ws) {
  const disconnectedPlayer =
    ws.deserializeAttachment()?.player;

  // 残っている相手へ切断を通知
  if(disconnectedPlayer){
    const outgoing = JSON.stringify({
      type: "peerDisconnected",
      player: disconnectedPlayer,
    });

    for(const socket of this.ctx.getWebSockets()){
      if(socket === ws) continue;

      try{
        socket.send(outgoing);
      }catch(_){}
    }
  }

  try{
    ws.close(1000, "Closed");
  }catch(_){}

  await this.broadcastPresence();
}
  async webSocketError(ws) {
    try {
      ws.close(1011, "WebSocket error");
    } catch (_) {}

    await this.broadcastPresence();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: JSON_HEADERS,
      });
    }

    // サーバー稼働確認
    if (url.pathname === "/") {
      return json({
        ok: true,
        service: "Nyan Chase Online",
        version: "beta-1",
      });
    }

    // 部屋作成
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      // 6桁コードの衝突時は最大10回まで再生成
      for (let i = 0; i < 10; i++) {
        const roomCode = makeRoomCode();
        const id = env.GAME_ROOMS.idFromName(roomCode);
        const stub = env.GAME_ROOMS.get(id);

        const response = await stub.fetch(
          new Request("https://room/internal/init", {
            method: "POST",
          })
        );

        if (response.ok) {
          const result = await response.json();

          return json({
            ok: true,
            roomCode,
            player: result.player,
            token: result.token,
          });
        }
      }

      return json(
        {
          ok: false,
          error: "could_not_create_room",
        },
        503
      );
    }

    const match = url.pathname.match(
      /^\/api\/rooms\/([0-9]{6})\/(join|status|ws)$/
    );

    if (match) {
      const roomCode = match[1];
      const action = match[2];

      const id = env.GAME_ROOMS.idFromName(roomCode);
      const stub = env.GAME_ROOMS.get(id);

      if (action === "join" && request.method === "POST") {
        const response = await stub.fetch(
          new Request("https://room/internal/join", {
            method: "POST",
          })
        );

        return new Response(response.body, {
          status: response.status,
          headers: JSON_HEADERS,
        });
      }

      if (action === "status" && request.method === "GET") {
        const response = await stub.fetch(
          new Request("https://room/internal/status")
        );

        return new Response(response.body, {
          status: response.status,
          headers: JSON_HEADERS,
        });
      }

      if (action === "ws") {
        const token = url.searchParams.get("token") || "";

        return stub.fetch(
          new Request(
            `https://room/internal/ws?token=${encodeURIComponent(token)}`,
            request
          )
        );
      }
    }

    return json(
      {
        ok: false,
        error: "not_found",
      },
      404
    );
  },
};
