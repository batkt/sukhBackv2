/**
 * `gate-room-{barilgiinId}` өрөөнд холбогдсон локал worker-ийн тоо.
 *
 * PM2 cluster горимд worker-ийн socket аль нэг л процесс дээр амьдардаг.
 * `io.sockets.adapter.rooms` нь ЗӨВХӨН тухайн процессын socket-уудыг
 * хардаг тул бусад процесс дээр "worker холбогдоогүй" гэж буруу хэлдэг.
 * `fetchSockets()` нь Redis adapter-аар бүх процессоос асууна.
 */
async function gateWorkerToo(io, barilgiinId) {
  const roomName = `gate-room-${barilgiinId}`;
  try {
    const sockets = await io.in(roomName).fetchSockets();
    return sockets.length;
  } catch (err) {
    // Бусад процесс хариу өгөөгүй (timeout) — ядаж локал мэдээллээр шийднэ.
    console.warn(`[GateRoom] fetchSockets failed for ${roomName}: ${err.message}`);
    const room = io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }
}

module.exports = { gateWorkerToo };
