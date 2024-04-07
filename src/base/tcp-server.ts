import * as net from "net"

export default function startTCPServer(
  options: net.ListenOptions,
  listener: (socket: net.Socket) => Promise<void>,
) {
  const server = net.createServer({ pauseOnConnect: true })
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  server.on("connection", (socket) => handleConnection(socket, listener))
  server.listen(options)
}

async function handleConnection(
  socket: net.Socket,
  listener: (socket: net.Socket) => Promise<void>,
) {
  console.log("new connection:", socket.remoteAddress, socket.remotePort)

  try {
    await listener(socket)
  } catch (err) {
    console.error(err)
  } finally {
    socket.destroy()
  }
}
