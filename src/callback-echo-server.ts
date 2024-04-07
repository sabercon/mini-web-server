import * as net from "net"

/**
 * Starts a TCP server that reads data from clients and writes the same data back
 */
export default function startEchoServer(options: net.ListenOptions) {
  const server = net.createServer()
  server.on("error", handleError)
  server.on("connection", handleConnection)
  server.listen(options)
}

function handleError(error: Error) {
  console.log("server error:", error.message)
  throw error
}

function handleConnection(socket: net.Socket) {
  console.log("new connection:", socket.remoteAddress, socket.remotePort)

  socket.on("end", () => {
    // FIN received. The connection will be closed automatically
    console.log("EOF")
  })

  socket.on("data", (data) => {
    console.log("data:", data.toString())
    socket.write(data)

    if (data.includes("q")) {
      console.log("closing")
      socket.end()
    }
  })
}
