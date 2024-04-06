import * as net from "net"

/**
 * Starts a TCP server that reads data from clients and writes the same data back
 */
export default function echoServer(options: net.ListenOptions) {
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

  socket.on("data", (data: Buffer) => {
    console.log("data:", data.toString())
    // echoes back the data
    socket.write(data)

    // actively closes the connection if the data contains 'q'
    if (data.includes("q")) {
      console.log("closing")
      // this will send FIN and close the connection
      socket.end()
    }
  })
}
