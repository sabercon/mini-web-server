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
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const msg = cutMessage(buf)

    if (msg == null) {
      const data = await conn.read()
      if (data == "END") {
        console.log("EOF")
        return
      }
      buf.push(data)
      continue
    }

    if (msg == "quit\n") {
      const reply = Buffer.from("Bye.\n")
      await conn.write(reply)
      return
    }

    const reply = Buffer.from(`Echo: ${msg}`)
    await conn.write(reply)
  }
}

function cutMessage(buffer: DynamicBuffer): string | null {
  const msgEnd = buffer.indexOf("\n")
  return msgEnd < 0 ? null : buffer.popString(msgEnd + 1)
}
