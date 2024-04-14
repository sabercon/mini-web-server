import * as net from "net"
import TCPConnection from "./base/tcp-connection"
import startTCPServer from "./base/tcp-server"
import DynamicBuffer from "./base/dynamic-buffer"

/**
 * Starts a TCP server using a simple protocol.
 *
 * Our protocol consists of messages separated by '\n' (the newline character).
 * The server reads messages and sends back replies using the same protocol.
 *
 * - If the client sends 'quit', reply with 'Bye.' and close the connection.
 * - Otherwise, echo the message back with the prefix 'Echo: '.
 */
export default function startEchoServer(options: net.ListenOptions) {
  startTCPServer(options, echo)
}

async function echo(conn: TCPConnection) {
  const buf = new DynamicBuffer()
  for (;;) {
    const msg = await cutMessage(conn, buf)
    if (msg == "END") return

    if (msg.equals(Buffer.from("quit\n"))) {
      console.log("closing")
      await conn.write(Buffer.from("Bye.\n"))
      return
    }

    await conn.write(Buffer.from(`Echo: ${msg.toString()}`))
  }
}

async function cutMessage(
  conn: TCPConnection,
  buf: DynamicBuffer,
): Promise<Buffer | "END"> {
  while (buf.indexOf("\n") < 0) {
    const data = await conn.read()
    if (data == "END") return "END"

    buf.push(data)
  }
  return buf.pop(buf.indexOf("\n") + 1)
}
