import * as net from "net"
import TCPConnection from "./tcp-connection"

export default function startTCPServer(
  options: net.ListenOptions,
  connHandler: (conn: TCPConnection) => Promise<void>,
) {
  const server = net.createServer({ pauseOnConnect: true, noDelay: true })
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  server.on("connection", (socket) => handleConnection(socket, connHandler))
  server.listen(options)
}

async function handleConnection(
  socket: net.Socket,
  connHandler: (conn: TCPConnection) => Promise<void>,
) {
  console.log("new connection:", socket.remoteAddress, socket.remotePort)

  try {
    const conn = new TCPConnection(socket)
    await connHandler(conn)
  } catch (err) {
    console.error(err)
  } finally {
    socket.destroy()
  }
}
