import net from "net"
import DynamicBuffer from "./base/dynamic-buffer"
import TCPConnection from "./tcp/tcp-connection"
import startTCPServer from "./tcp/tcp-server"

/**
 * Starts a TCP server using a simple protocol.
 *
 * Our protocol consists of messages separated by '\n' (the newline character).
 * The server reads messages and sends back replies using the same protocol.
 *
 * - If the client sends 'quit', reply with 'Bye.' and close the connection.
 * - Otherwise, echo the message back with the prefix 'Echo: '.
 */
export default function startMessageEchoServer(options: net.ListenOptions) {
  startTCPServer(options, echo)
}

async function echo(conn: TCPConnection) {
  const buf = new DynamicBuffer()
  for (;;) {
    const msg = await cutMessage(conn, buf)
    if (msg == "END") return

    if (msg.equals(Buffer.from("quit\n"))) {
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
