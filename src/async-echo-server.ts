import * as net from "net"
import TCPConnection from "./base/tcp-connection"
import startTCPServer from "./base/tcp-server"

/**
 * Starts a TCP server that reads data from clients and writes the same data back
 */
export default function startEchoServer(options: net.ListenOptions) {
  startTCPServer(options, echo)
}

async function echo(socket: net.Socket) {
  const conn = new TCPConnection(socket)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await conn.read()
    if (data == TCPConnection.EOF) {
      console.log("EOF")
      break
    }

    console.log("data:", data.toString())
    await conn.write(data)
  }
}
