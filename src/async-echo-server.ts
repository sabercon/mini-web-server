import net from "net"
import TCPConnection from "./tcp/tcp-connection"
import startTCPServer from "./tcp/tcp-server"

/**
 * Starts a TCP server that reads data from clients and writes the same data back.
 */
export default function startAsyncEchoServer(options: net.ListenOptions) {
  startTCPServer(options, echo)
}

async function echo(conn: TCPConnection) {
  for (;;) {
    const data = await conn.read()
    if (data == "END") return

    console.log("data:", data.toString())
    await conn.write(data)
  }
}
